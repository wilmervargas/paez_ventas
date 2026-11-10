@echo off
chcp 65001 >nul

:: Verificar si ya se está ejecutando mediante PowerShell (oculto)
if "%1"=="hidden" goto :skip_launch
start /min powershell -WindowStyle Hidden -Command "Start-Process '%~dpnx0' -ArgumentList 'hidden' -NoNewWindow"
exit /b

:skip_launch
setlocal enabledelayedexpansion
set BaseDir=C:\py\websystemdev\paez

echo ====================================================
echo INICIANDO VALIDACIONES DEL SISTEMA PAEZ
echo ====================================================

:: 1. Validar directorio base principal
if not exist %BaseDir% (
    goto :error_dir
)

:: 2. Validar Backend
set BackendDir=%BaseDir%\backend
set VenvActivate=%BackendDir%\.venv\Scripts\activate.bat
set ManagePy=%BackendDir%\manage.py

if not exist %BackendDir% goto :error_general
if not exist %VenvActivate% goto :error_general
if not exist %ManagePy% goto :error_general

:: 3. Validar Frontend
set FrontendDir=%BaseDir%\frontend
set PackageJson=%FrontendDir%\package.json
set NodeModules=%FrontendDir%\node_modules

if not exist %FrontendDir% goto :error_general
if not exist %PackageJson% goto :error_general

:: 4 y 5. Lanzar los procesos en segundo plano usando Start-Process invisible de PowerShell
powershell -Command "Start-Process cmd -ArgumentList '/c cd /d \"%BackendDir%\" && call \"%VenvActivate%\" && python manage.py runserver' -WindowStyle Hidden"
powershell -Command "Start-Process cmd -ArgumentList '/c cd /d \"%FrontendDir%\" && npm run dev' -WindowStyle Hidden"

:: 6. Esperar unos segundos a que levanten los servicios y abrir navegador
timeout /t 3 /nobreak >nul
set FrontendUrl=http://localhost:5173

set ChromeExe=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set ChromeExe="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set ChromeExe="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
    set ChromeExe="%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
)

if defined ChromeExe (
    start "" %ChromeExe% %FrontendUrl%
) else (
    start "" %FrontendUrl%
)

exit /b 0

:error_dir
:error_general
exit /b 1
