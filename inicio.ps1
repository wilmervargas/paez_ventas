<#
.SYNOPSIS
 Script de inicio automatizado para Paez (Backend Django + Frontend Node en segundo plano).
#>
$ErrorActionPreference = 'Stop'
$BaseDir = 'C:\py\websystemdev\paez'

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "INICIANDO VALIDACIONES DEL SISTEMA PAEZ" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

try {
    # 1. Validar directorio base principal
    if (-not (Test-Path -Path $BaseDir)) {
        throw "El directorio principal $BaseDir no existe o la ruta es incorrecta."
    }
    Write-Host "[OK] Directorio base encontrado: $BaseDir" -ForegroundColor Green

    # 2. Validar Backend
    $BackendDir = Join-Path $BaseDir "backend"
    # El entorno virtual puede llamarse ".venv" o "venv" según la máquina.
    $VenvCandidates = @(
        (Join-Path $BackendDir ".venv\Scripts\Activate.ps1"),
        (Join-Path $BackendDir "venv\Scripts\Activate.ps1")
    )
    $VenvActivate = $VenvCandidates | Where-Object { Test-Path -Path $_ } | Select-Object -First 1
    $ManagePy = Join-Path $BackendDir "manage.py"

    if (-not (Test-Path -Path $BackendDir)) {
        throw "La carpeta backend no se encuentra en $BaseDir."
    }
    if (-not $VenvActivate) {
        throw "No se encontró el entorno virtual en backend\.venv ni backend\venv."
    }
    if (-not (Test-Path -Path $ManagePy)) {
        throw "No se encuentra manage.py en el backend."
    }
    Write-Host "[OK] Estructura del Backend validada correctamente." -ForegroundColor Green

    # 3. Validar Frontend
    $FrontendDir = Join-Path $BaseDir "frontend"
    $PackageJson = Join-Path $FrontendDir "package.json"
    $NodeModules = Join-Path $FrontendDir "node_modules"

    if (-not (Test-Path -Path $FrontendDir)) {
        throw "La carpeta frontend no se encuentra en $BaseDir."
    }
    if (-not (Test-Path -Path $PackageJson)) {
        throw "No se encuentra package.json en el frontend."
    }
    if (-not (Test-Path -Path $NodeModules)) {
        Write-Warning "Advertencia: La carpeta node_modules no existe en el frontend. Puede ser necesario ejecutar npm install."
    }
    Write-Host "[OK] Estructura del Frontend validada correctamente." -ForegroundColor Green

    Write-Host "----------------------------------------------------" -ForegroundColor Cyan
    Write-Host "Validaciones completadas con exito." -ForegroundColor Green
    Write-Host "Lanzando servidores en segundo plano y abriendo navegador..." -ForegroundColor Cyan
    Write-Host "----------------------------------------------------" -ForegroundColor Cyan

    # 4. Comandos de ejecucion para los servidores invisibles
    $CmdBackend = "Set-Location '$BackendDir'; . '$VenvActivate'; python manage.py runserver"
    $CmdFrontend = "Set-Location '$FrontendDir'; npm run dev"

    # 5. Lanzar los procesos con WindowStyle Hidden para que corran ocultos
    Start-Process powershell -ArgumentList "-WindowStyle", "Hidden", "-Command", $CmdBackend
    Start-Process powershell -ArgumentList "-WindowStyle", "Hidden", "-Command", $CmdFrontend

    # 6. Esperar unos segundos a que levanten los servicios y abrir Google Chrome (o predeterminado)
    Start-Sleep -Seconds 3
    $FrontendUrl = "http://localhost:5173"

    # Posibles rutas de Google Chrome en Windows
    $ChromePaths = @(
        "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )

    $ChromeExe = $ChromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($ChromeExe) {
        Write-Host "Abriendo enlace en Google Chrome: $FrontendUrl" -ForegroundColor Cyan
        Start-Process -FilePath $ChromeExe -ArgumentList $FrontendUrl
    } else {
        Write-Warning "Google Chrome no encontrado. Abriendo en el navegador predeterminado: $FrontendUrl"
        Start-Process $FrontendUrl
    }

    Write-Host "¡Servidores ejecutándose en segundo plano y navegador abierto!" -ForegroundColor Cyan

} catch {
    Write-Host "----------------------------------------------------" -ForegroundColor Red
    Write-Host "ERROR EN LA VALIDACION: $_" -ForegroundColor Red
    Write-Host "----------------------------------------------------" -ForegroundColor Red
    Read-Host "Presione Enter para salir"
    exit 1
}
