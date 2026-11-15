import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';

// ---------------------------------------------------------------------------
// Configuracion
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3000);
const AUTH_DIR = process.env.AUTH_DIR
  ? path.resolve(process.env.AUTH_DIR)
  : path.join(__dirname, 'auth_info');
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Baileys usa pino internamente; en 'silent' evita llenar la consola de ruido.
const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });

// ---------------------------------------------------------------------------
// Estado de la conexion
// ---------------------------------------------------------------------------
let sock = null;
let connectionState = 'starting'; // starting | connecting | qr | open | close | logged_out
let qrDataUrl = null;
let lastError = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let connecting = false;
let shuttingDown = false;
let epoch = 0; // invalida conexiones viejas cuando se cierra sesion/desconecta

// ---------------------------------------------------------------------------
// Conexion con WhatsApp (Baileys)
// ---------------------------------------------------------------------------
async function startConnection() {
  if (shuttingDown || connecting) return;

  connecting = true;
  const myEpoch = ++epoch;

  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  connectionState = 'connecting';
  lastError = null;

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    if (myEpoch !== epoch) return;

    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      version = undefined; // usa la version incluida en la libreria
    }

    const socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      browser: ['WA React Test', 'Chrome', '1.0.0'],
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    if (myEpoch !== epoch) {
      try {
        socket.end(undefined);
      } catch {
        /* ignorar */
      }
      return;
    }

    sock = socket;

    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', (update) => {
      void handleConnectionUpdate(socket, update);
    });

    console.log('[INFO] Iniciando conexion con WhatsApp...');
  } catch (error) {
    lastError = error.message;
    connectionState = 'close';
    console.error('[ERROR] No se pudo iniciar Baileys:', error);
    scheduleReconnect();
  } finally {
    connecting = false;
  }
}

async function handleConnectionUpdate(socket, update) {
  if (sock !== socket) return;

  const { connection, qr, lastDisconnect } = update;

  if (qr) {
    connectionState = 'qr';
    try {
      qrDataUrl = await QRCode.toDataURL(qr, {
        width: 340,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
    } catch {
      qrDataUrl = null;
    }

    if (sock === socket) {
      qrcodeTerminal.generate(qr, { small: true });
      console.log(
        '\n[QR] Escanea este codigo en WhatsApp > Dispositivos vinculados > Vincular un dispositivo.\n'
      );
    }
  }

  if (connection === 'open') {
    connectionState = 'open';
    qrDataUrl = null;
    lastError = null;
    reconnectAttempts = 0;
    console.log('[OK] WhatsApp conectado correctamente.');
  }

  if (connection === 'close') {
    if (sock !== socket) return;

    const code = lastDisconnect?.error?.output?.statusCode;
    const reason = lastDisconnect?.error?.message || 'sin detalles';
    lastError = code ? `${reason} (codigo ${code})` : reason;
    console.warn('[WARN] Conexion cerrada:', lastError);

    if (code === DisconnectReason.loggedOut) {
      connectionState = 'logged_out';
      qrDataUrl = null;
      console.warn(
        '[WARN] La sesion se cerro desde el telefono. Usa "Vincular otro numero" para generar un QR nuevo.'
      );
      return;
    }

    connectionState = 'close';
    qrDataUrl = null;
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) return;

  reconnectAttempts += 1;
  const delay = Math.min(30000, 3000 * 2 ** (reconnectAttempts - 1));
  console.log(
    `[INFO] Reintentando conexion en ${Math.round(delay / 1000)} s (intento ${reconnectAttempts})...`
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startConnection();
  }, delay);
}

async function stopSocket({ logout = false } = {}) {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;

  const current = sock;
  sock = null;

  if (!current) return;

  try {
    if (logout) await current.logout();
  } catch {
    /* el socket puede estar ya cerrado */
  }

  try {
    current.end(undefined);
  } catch {
    /* ignorar */
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function normalizePhone(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function stateInfo() {
  switch (connectionState) {
    case 'starting':
      return { connected: false, needsQr: false, message: 'Iniciando servidor...' };
    case 'connecting':
      return { connected: false, needsQr: false, message: 'Conectando con WhatsApp...' };
    case 'qr':
      return { connected: false, needsQr: true, message: 'Escanea el codigo QR para vincular el dispositivo.' };
    case 'open':
      return { connected: true, needsQr: false, message: 'WhatsApp conectado y listo para enviar.' };
    case 'close':
      return { connected: false, needsQr: false, message: 'Conexion cerrada. Reintentando...' };
    case 'logged_out':
      return {
        connected: false,
        needsQr: true,
        message: 'Sesion cerrada desde el telefono. Vincula un numero de nuevo.',
      };
    default:
      return { connected: false, needsQr: false, message: connectionState };
  }
}

function ownNumber() {
  const id = sock?.user?.id;
  if (!id) return null;
  const match = String(id).match(/^\d+/);
  return match ? match[0] : null;
}

// ---------------------------------------------------------------------------
// API HTTP
// ---------------------------------------------------------------------------
const app = express();

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

app.use(
  cors({
    origin(origin, callback) {
      // Permite herramientas locales (curl/Postman) sin cabecera Origin y
      // cualquier puerto de localhost (Vite puede usar 5173, 5174, etc.).
      if (!origin || CORS_ORIGINS.includes(origin) || LOCALHOST_ORIGIN.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({
    name: 'whatsapp-test-server',
    status: '/api/whatsapp/status',
    send: 'POST /api/whatsapp/send',
    restart: 'POST /api/whatsapp/restart',
    logout: 'POST /api/whatsapp/logout',
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.get('/api/whatsapp/status', (_req, res) => {
  const info = stateInfo();
  res.json({
    ...info,
    state: connectionState,
    qrDataUrl,
    lastError,
    me: ownNumber(),
    hasSession: fs.existsSync(AUTH_DIR),
    attempts: reconnectAttempts,
    uptime: Math.round(process.uptime()),
  });
});

app.post('/api/whatsapp/send', async (req, res) => {
  const { to, message } = req.body || {};
  const phone = normalizePhone(to);

  if (!phone || phone.length < 8 || phone.length > 15) {
    return res.status(400).json({
      success: false,
      error:
        'Numero de destino invalido. Usa formato internacional y solo digitos (ej: 584144979139).',
    });
  }

  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, error: 'El mensaje no puede estar vacio.' });
  }

  if (connectionState !== 'open' || !sock) {
    return res.status(409).json({
      success: false,
      error: 'WhatsApp no esta conectado. Vincula el dispositivo escaneando el codigo QR.',
    });
  }

  const jid = `${phone}@s.whatsapp.net`;

  try {
    let targetJid = jid;

    try {
      const results = await sock.onWhatsApp(jid);
      const found = Array.isArray(results) ? results[0] : undefined;

      if (!found?.exists) {
        return res.status(404).json({
          success: false,
          error: `El numero ${phone} no esta registrado en WhatsApp.`,
        });
      }

      targetJid = found.jid || jid;
    } catch (error) {
      // Si la verificacion falla (limite de peticiones, red), se intenta enviar igual.
      console.warn('[WARN] No se pudo verificar el numero, se intentara enviar igual:', error.message);
    }

    const sent = await sock.sendMessage(targetJid, { text: message.trim() });

    return res.json({
      success: true,
      message: 'Mensaje enviado correctamente.',
      messageId: sent?.key?.id ?? null,
      to: phone,
      me: ownNumber(),
    });
  } catch (error) {
    console.error('[ERROR] Fallo al enviar mensaje:', error);
    return res.status(500).json({
      success: false,
      error: `No se pudo enviar el mensaje: ${error.message}`,
    });
  }
});

app.post('/api/whatsapp/restart', async (_req, res) => {
  try {
    epoch += 1; // invalida cualquier conexion en curso
    await stopSocket();
    connectionState = 'starting';
    qrDataUrl = null;
    lastError = null;
    reconnectAttempts = 0;

    setTimeout(() => {
      void startConnection();
    }, 300);

    return res.json({ success: true, message: 'Reconectando con WhatsApp...' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/whatsapp/logout', async (_req, res) => {
  try {
    epoch += 1;
    await stopSocket({ logout: true });

    fs.rmSync(AUTH_DIR, { recursive: true, force: true });

    connectionState = 'starting';
    qrDataUrl = null;
    lastError = null;
    reconnectAttempts = 0;

    setTimeout(() => {
      void startConnection();
    }, 500);

    return res.json({
      success: true,
      message: 'Sesion eliminada. En unos segundos aparecera un nuevo codigo QR.',
    });
  } catch (error) {
    console.error('[ERROR] Fallo al cerrar sesion:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Manejo de errores de Express (JSON malformado, CORS, etc.)
app.use((error, _req, res, _next) => {
  console.error('[ERROR] HTTP:', error.message);
  res.status(500).json({ success: false, error: error.message });
});

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
const server = app.listen(PORT, () => {
  console.log('');
  console.log('==========================================================');
  console.log('  Backend WhatsApp (Baileys) escuchando en el puerto', PORT);
  console.log('  API:      http://localhost:' + PORT + '/api/whatsapp/status');
  console.log('  Sesion:  ', AUTH_DIR);
  console.log('==========================================================');
  console.log('');
  void startConnection();
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n[INFO] Cerrando (${signal})...`);
  clearTimeout(reconnectTimer);

  try {
    sock?.end(undefined);
  } catch {
    /* ignorar */
  }

  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('[WARN] Promesa rechazada sin manejar:', reason);
});
