# Arranca backend y frontend en ventanas separadas.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path "$root\server\node_modules")) {
    Write-Host "Instalando dependencias del backend..." -ForegroundColor Cyan
    npm --prefix "$root\server" install
}

if (-not (Test-Path "$root\client\node_modules")) {
    Write-Host "Instalando dependencias del frontend..." -ForegroundColor Cyan
    npm --prefix "$root\client" install
}

Write-Host "Abriendo backend (puerto 3000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\server'; npm start"

Start-Sleep -Seconds 2

Write-Host "Abriendo frontend (puerto 5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\client'; npm run dev"

Write-Host ""
Write-Host "Listo. Abre la URL que muestre la ventana del frontend (normalmente http://localhost:5173)." -ForegroundColor Yellow
