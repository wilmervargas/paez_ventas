@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: Relanzar oculto (doble clic sin consola)
if "%~1"=="hidden" goto :skip_launch
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '%~f0' -ArgumentList 'hidden' -WindowStyle Hidden"
exit /b

:skip_launch
set "BaseDir=C:\py\websystemdev\paez"
set "BackendDir=%BaseDir%\backend"
set "FrontendDir=%BaseDir%\frontend"
set "WsDir=%BaseDir%\ws\server"
set "FrontendUrl=http://localhost:5173"
set "LogFile=%BaseDir%\launcher.log"

echo [%date% %time%] Iniciando servicios... > "%LogFile%"

:: Validaciones basicas con registro de error
if not exist "%BaseDir%" (
    echo [ERROR] No existe BaseDir: %BaseDir% >> "%LogFile%"
    exit /b 1
)

set "VenvActivate=%BackendDir%\.venv\Scripts\activate.bat"
if not exist "%VenvActivate%" set "VenvActivate=%BackendDir%\venv\Scripts\activate.bat"

if not exist "%VenvActivate%" (
    echo [ERROR] No se encontro entorno virtual en %BackendDir% >> "%LogFile%"
    exit /b 1
)
if not exist "%BackendDir%\manage.py" (
    echo [ERROR] No existe manage.py en %BackendDir% >> "%LogFile%"
    exit /b 1
)
if not exist "%FrontendDir%\package.json" (
    echo [ERROR] No existe package.json en %FrontendDir% >> "%LogFile%"
    exit /b 1
)

:: 1. Backend (Puerto 8000)
powershell -NoProfile -Command "if(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue){exit 0}else{exit 1}" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Levantando Backend en puerto 8000... >> "%LogFile%"
    start "" /min cmd /c "cd /d "%BackendDir%" && call "%VenvActivate%" && python manage.py runserver >> "%BaseDir%\backend.log" 2>&1"
) else (
    echo [INFO] Backend ya activo en puerto 8000. >> "%LogFile%"
)

:: 2. Frontend (Puerto 5173)
set "FRONT_WAS_UP=0"
powershell -NoProfile -Command "if(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue){exit 0}else{exit 1}" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Levantando Frontend en puerto 5173... >> "%LogFile%"
    start "" /min cmd /c "cd /d "%FrontendDir%" && npm run dev >> "%BaseDir%\frontend.log" 2>&1"
) else (
    echo [INFO] Frontend ya activo en puerto 5173. >> "%LogFile%"
    set "FRONT_WAS_UP=1"
)

:: 3. WhatsApp servicio local (Puerto 3000)
if exist "%WsDir%\package.json" (
    powershell -NoProfile -Command "if(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue){exit 0}else{exit 1}" >nul 2>&1
    if errorlevel 1 (
        echo [INFO] Levantando servicio WS en puerto 3000... >> "%LogFile%"
        start "" /min cmd /c "cd /d "%WsDir%" && npm start >> "%BaseDir%\ws.log" 2>&1"
    ) else (
        echo [INFO] Servicio WS ya activo en puerto 3000. >> "%LogFile%"
    )
)

:: Esperar a que el frontend responda (max 30s)
echo [INFO] Esperando respuesta de %FrontendUrl%... >> "%LogFile%"
powershell -NoProfile -Command "$d=(Get-Date).AddSeconds(30); while((Get-Date)-lt $d){ try{ $r=Invoke-WebRequest -Uri '%FrontendUrl%' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -ge 200){exit 0} }catch{}; Start-Sleep -Milliseconds 700 }; exit 1" >nul 2>&1

if errorlevel 1 (
    echo [ERROR] El frontend no respondio despues de 30 segundos. Revisa frontend.log >> "%LogFile%"
)

:: Si el frontend ya estaba arriba, intentar enfocar pestana existente
if "%FRONT_WAS_UP%"=="1" (
    powershell -NoProfile -Command ^
      "Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes; $root=[System.Windows.Automation.AutomationElement]::RootElement; $cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::TabItem); $tab=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$cond)|Where-Object{ $_.Current.Name -match 'localhost:5173|Paez|Vite' }|Select-Object -First 1; if($tab){ $sel=$null; if($tab.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern,[ref]$sel)){ $sel.Select() }; $w=New-Object System.Windows.Automation.TreeWalker([System.Windows.Automation.Condition]::TrueCondition); $win=$tab; while($win -and $win.Current.ControlType -ne [System.Windows.Automation.ControlType]::Window){ $win=$w.GetParent($win) }; if($win){ try{$win.SetFocus()}catch{}; (New-Object -ComObject WScript.Shell).AppActivate($win.Current.Name)|Out-Null }; exit 0 } else { exit 1 }" >nul 2>&1
    if not errorlevel 1 exit /b 0
)

:: Buscar Google Chrome en primera instancia
set "ChromeExe="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "ChromeExe=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined ChromeExe if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "ChromeExe=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined ChromeExe if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "ChromeExe=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if not defined ChromeExe (
    for /f "tokens=2*" %%A in ('reg query "HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" /ve 2^>nul') do set "ChromeExe=%%~B"
)

if defined ChromeExe (
    echo [INFO] Abriendo en Google Chrome: %ChromeExe% >> "%LogFile%"
    start "" "%ChromeExe%" "%FrontendUrl%"
) else (
    echo [AVISO] Chrome no encontrado, abriendo navegador predeterminado. >> "%LogFile%"
    start "" "%FrontendUrl%"
)

endlocal
exit /b 0