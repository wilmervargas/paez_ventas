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

:: Validaciones basicas
if not exist "%BaseDir%" exit /b 1

set "VenvActivate=%BackendDir%\.venv\Scripts\activate.bat"
if not exist "%VenvActivate%" set "VenvActivate=%BackendDir%\venv\Scripts\activate.bat"
if not exist "%BackendDir%" exit /b 1
if not exist "%VenvActivate%" exit /b 1
if not exist "%BackendDir%\manage.py" exit /b 1
if not exist "%FrontendDir%\package.json" exit /b 1

:: Helper: puerto en escucha? (0 = si, 1 = no)
:: Backend 8000
powershell -NoProfile -Command "if(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue){exit 0}else{exit 1}" >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c cd /d \"%BackendDir%\" && call \"%VenvActivate%\" && python manage.py runserver' -WindowStyle Hidden" >nul 2>&1
)

:: Frontend 5173
set "FRONT_WAS_UP=0"
powershell -NoProfile -Command "if(Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue){exit 0}else{exit 1}" >nul 2>&1
if errorlevel 1 (
  set "FRONT_WAS_UP=0"
  powershell -NoProfile -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c cd /d \"%FrontendDir%\" && npm run dev' -WindowStyle Hidden" >nul 2>&1
) else (
  set "FRONT_WAS_UP=1"
)

:: WhatsApp servicio local 3000 (ws/server)
if exist "%WsDir%\package.json" (
  powershell -NoProfile -Command "if(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue){exit 0}else{exit 1}" >nul 2>&1
  if errorlevel 1 (
    powershell -NoProfile -WindowStyle Hidden -Command "Start-Process cmd -ArgumentList '/c cd /d \"%WsDir%\" && npm start' -WindowStyle Hidden" >nul 2>&1
  )
)

:: Esperar a que frontend responda (max ~30s)
powershell -NoProfile -Command "$d=(Get-Date).AddSeconds(30); while((Get-Date)-lt $d){ try{ $r=Invoke-WebRequest -Uri '%FrontendUrl%' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -ge 200){exit 0} }catch{}; Start-Sleep -Milliseconds 700 }; exit 1" >nul 2>&1

:: Si el frontend ya estaba activo, intentar enfocar pestana existente; si no, no abrir nueva
if "%FRONT_WAS_UP%"=="1" (
  powershell -NoProfile -Command ^
    "Add-Type -AssemblyName UIAutomationClient; Add-Type -AssemblyName UIAutomationTypes; $root=[System.Windows.Automation.AutomationElement]::RootElement; $cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::TabItem); $tab=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$cond)|Where-Object{ $_.Current.Name -match 'localhost:5173|Paez|Vite' }|Select-Object -First 1; if($tab){ $sel=$null; if($tab.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern,[ref]$sel)){ $sel.Select() }; $w=New-Object System.Windows.Automation.TreeWalker([System.Windows.Automation.Condition]::TrueCondition); $win=$tab; while($win -and $win.Current.ControlType -ne [System.Windows.Automation.ControlType]::Window){ $win=$w.GetParent($win) }; if($win){ try{$win.SetFocus()}catch{}; (New-Object -ComObject WScript.Shell).AppActivate($win.Current.Name)|Out-Null } }" >nul 2>&1
  exit /b 0
)

:: Frontend recien iniciado: abrir navegador
set "ChromeExe="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "ChromeExe=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined ChromeExe if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "ChromeExe=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined ChromeExe if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "ChromeExe=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if defined ChromeExe (
  start "" "%ChromeExe%" "%FrontendUrl%"
) else (
  start "" "%FrontendUrl%"
)

endlocal
exit /b 0
