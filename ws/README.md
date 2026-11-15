# Prueba de WhatsApp · React + Node.js + Baileys

Proyecto mínimo para probar el envío automático de mensajes de WhatsApp desde un número vinculado
por código QR (Baileys) hacia otro número, disparando el envío desde una interfaz React.

- **Backend:** Node.js + Express + `@whiskeysockets/baileys` 6.7.24
- **Frontend:** React 19 + Vite 7
- **Destino de prueba precargado:** `584144979139`
- **Emisor sugerido:** `584244032682` (o cualquier número que escanees)

> Método no oficial: usa una sesión de WhatsApp Web. No se paga a Meta por conversación, pero el
> envío masivo o a desconocidos puede provocar restricciones o baneo del número. Úsalo para pruebas y
> mensajes transaccionales moderados.

## Estructura

```
ws/
├── server/              Backend Express + Baileys
│   ├── index.js         Conexión WhatsApp, QR y endpoints HTTP
│   ├── package.json
│   └── auth_info/       Credenciales de la sesión (se genera al vincular)
├── client/              Frontend React + Vite
│   ├── src/App.jsx      Interfaz de prueba
│   ├── src/styles.css
│   ├── vite.config.js   Proxy /api -> http://localhost:3000
│   └── package.json
├── start.ps1            Arranca backend y frontend en ventanas separadas
└── README.md
```

## Requisitos

- **Node.js 20 o superior** (probado con Node 26) y npm.
- Un teléfono con WhatsApp e internet para escanear el QR (el emisor).
- Git instalado (solo si npm necesita descargar la dependencia `libsignal` de Baileys).

## Instalación

Ya están instaladas las dependencias, pero si necesitas repetirlo:

```powershell
cd C:\py\websystemdev\ws\server
npm install

cd C:\py\websystemdev\ws\client
npm install
```

## Cómo ejecutar (dos terminales)

### Terminal 1 · Backend

```powershell
cd C:\py\websystemdev\ws\server
npm start
```

Verás algo como:

```
Backend WhatsApp (Baileys) escuchando en el puerto 3000
...
[QR] Escanea este codigo en WhatsApp > Dispositivos vinculados > Vincular un dispositivo.
```

### Terminal 2 · Frontend

```powershell
cd C:\py\websystemdev\ws\client
npm run dev
```

Abre la URL que muestra Vite, normalmente **http://localhost:5173**. Si el puerto está ocupado,
Vite usará otro (por ejemplo **http://localhost:5174**); abre el que aparezca en la terminal.

### Alternativa rápida en Windows

```powershell
cd C:\py\websystemdev\ws
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Abre dos ventanas (backend y frontend). Si Windows bloquea scripts, usa el comando de dos terminales.

## Uso

1. Con el backend corriendo, abre la URL del frontend que muestra Vite (normalmente
   **http://localhost:5173**).
2. La tarjeta de estado mostrará el código QR (también aparece en la terminal).
3. En el teléfono emisor: **WhatsApp → Dispositivos vinculados → Vincular un dispositivo** y escanea el QR.
4. Cuando el estado cambie a **Conectado**, pulsa **Enviar WhatsApp**.
5. El mensaje se envía al número del campo **Destino** (por defecto `584144979139`).

La sesión se guarda en `server/auth_info`, así que en los siguientes arranques no hace falta
escanear de nuevo (mientras no cierres sesión desde el teléfono).

### Vincular otro número

- Botón **Vincular otro número** en la UI: cierra la sesión, borra `server/auth_info` y genera un QR
  nuevo para escanear con otro teléfono.
- Botón **Reconectar**: reinicia la conexión conservando la sesión actual.

## Endpoints del backend

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/whatsapp/status` | Estado, QR (data URL), número emisor y último error |
| POST | `/api/whatsapp/send` | Envía `{ "to": "584144979139", "message": "Hola" }` |
| POST | `/api/whatsapp/restart` | Reconecta conservando la sesión |
| POST | `/api/whatsapp/logout` | Borra la sesión y genera un QR nuevo |
| GET | `/api/health` | Comprobación básica del servidor |

Ejemplo con PowerShell:

```powershell
Invoke-RestMethod -Method Get http://localhost:3000/api/whatsapp/status

Invoke-RestMethod -Method Post http://localhost:3000/api/whatsapp/send `
  -ContentType 'application/json' `
  -Body '{"to":"584144979139","message":"Prueba desde PowerShell"}'
```

## Configuración opcional

Variables de entorno del backend:

| Variable | Por defecto | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Puerto del backend |
| `AUTH_DIR` | `server/auth_info` | Carpeta de credenciales |
| `CORS_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | Orígenes permitidos |
| `BAILEYS_LOG_LEVEL` | `silent` | Nivel de logs de Baileys (`debug` para depurar) |

## Solución de problemas

- **No aparece el QR / estado "Conectando":** espera unos segundos; si persiste, pulsa **Reconectar**
  y revisa la terminal. También prueba `BAILEYS_LOG_LEVEL=debug` al arrancar.
- **"La sesión se cerró desde el teléfono":** pulsa **Vincular otro número** y escanea de nuevo.
- **"Número no registrado en WhatsApp":** revisa el código de país y que el destino tenga WhatsApp.
- **El botón de enviar está deshabilitado:** el estado debe ser **Conectado** y el número debe tener
  al menos 8 dígitos.
- **Error de red en el frontend:** confirma que el backend corre en `http://localhost:3000` y que el
  frontend se abrió desde `http://localhost:5173`.
- **El QR caduca:** se renueva solo cada pocos segundos; escanea el más reciente.
- **Puerto ocupado:** cambia `PORT` en el backend y el `target` del proxy en `client/vite.config.js`.

## Notas de seguridad

- El endpoint de envío no tiene autenticación: no lo expongas a Internet tal cual.
- No subas `server/auth_info` a un repositorio: contiene las credenciales de la sesión.
- Mantén actualizado Baileys y el teléfono emisor con internet estable.
