import { useCallback, useEffect, useState } from 'react';

const DEFAULT_TO = '584144979139';
const DEFAULT_MESSAGE =
  'Hola 👋 Este es un mensaje de prueba enviado desde mi aplicación React con Node.js + Baileys.';

const STATE_LABELS = {
  starting: 'Iniciando',
  connecting: 'Conectando',
  qr: 'Esperando QR',
  open: 'Conectado',
  close: 'Reconectando',
  logged_out: 'Sesión cerrada',
};

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || `Error HTTP ${response.status}`);
  }

  return data;
}

export default function App() {
  const [status, setStatus] = useState({
    connected: false,
    state: 'starting',
    needsQr: false,
    qrDataUrl: null,
    message: 'Consultando estado...',
    lastError: null,
    me: null,
    hasSession: false,
  });
  const [backendDown, setBackendDown] = useState(false);
  const [to, setTo] = useState(DEFAULT_TO);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await api('/whatsapp/status');
      setStatus(data);
      setBackendDown(false);
    } catch {
      setBackendDown(true);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const interval = setInterval(() => {
      void refreshStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const cleanPhone = to.replace(/\D/g, '');
  const canSend = status.connected && !sending && cleanPhone.length >= 8 && message.trim().length > 0;

  const handleSend = async (event) => {
    event.preventDefault();
    if (!canSend) return;

    setSending(true);
    setResult(null);

    try {
      const data = await api('/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ to: cleanPhone, message }),
      });

      setResult({
        type: 'success',
        title: 'Mensaje enviado',
        text: `${data.message} Destino: ${data.to}. ID: ${data.messageId || 'no disponible'}.`,
      });
      void refreshStatus();
    } catch (error) {
      setResult({
        type: 'error',
        title: 'No se pudo enviar',
        text: error.message,
      });
    } finally {
      setSending(false);
    }
  };

  const handleRestart = async () => {
    setBusy(true);
    setResult(null);
    try {
      const data = await api('/whatsapp/restart', { method: 'POST' });
      setResult({ type: 'info', title: 'Reconectando', text: data.message });
      void refreshStatus();
    } catch (error) {
      setResult({ type: 'error', title: 'Error al reconectar', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    const confirmed = window.confirm(
      'Esto cerrará la sesión actual y borrará las credenciales guardadas. Tendrás que escanear un QR nuevo con el número que quieras usar.\n\n¿Continuar?'
    );
    if (!confirmed) return;

    setBusy(true);
    setResult(null);
    try {
      const data = await api('/whatsapp/logout', { method: 'POST' });
      setResult({ type: 'info', title: 'Sesión cerrada', text: data.message });
      void refreshStatus();
    } catch (error) {
      setResult({ type: 'error', title: 'Error al cerrar sesión', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const pillClass = status.connected ? 'pill pill--ok' : status.needsQr ? 'pill pill--warn' : 'pill';

  return (
    <main className="page">
      <header className="hero">
        <div className="hero__icon" aria-hidden="true">
          💬
        </div>
        <div>
          <h1>Prueba de WhatsApp</h1>
          <p>React + Node.js + Baileys · envío mediante sesión vinculada por QR</p>
        </div>
      </header>

      <section className="grid">
        <article className="card">
          <div className="card__head">
            <h2>Estado de la conexión</h2>
            <span className={pillClass}>{STATE_LABELS[status.state] || status.state}</span>
          </div>

          <p className={`status-message ${status.connected ? 'status-message--ok' : ''}`}>
            {status.message}
          </p>

          {status.me && (
            <p className="detail">
              <span>Emisor vinculado</span>
              <strong>+{status.me}</strong>
            </p>
          )}

          {status.lastError && (
            <p className="detail detail--error">
              <span>Último error</span>
              <strong>{status.lastError}</strong>
            </p>
          )}

          {backendDown && (
            <div className="notice notice--error">
              No se pudo contactar al backend en <code>http://localhost:3000</code>. Verifica que
              el servidor esté ejecutándose.
            </div>
          )}

          {status.needsQr && status.qrDataUrl && (
            <div className="qr-box">
              <img src={status.qrDataUrl} alt="Código QR para vincular WhatsApp" />
              <ol>
                <li>Abre WhatsApp en el teléfono emisor.</li>
                <li>
                  Ve a <strong>Dispositivos vinculados</strong>.
                </li>
                <li>
                  Toca <strong>Vincular un dispositivo</strong> y escanea este QR.
                </li>
              </ol>
              <p className="qr-hint">El código se renueva automáticamente cada pocos segundos.</p>
            </div>
          )}

          {status.needsQr && !status.qrDataUrl && (
            <div className="notice">
              Generando el código QR... si no aparece, pulsa <strong>Reconectar</strong> o revisa la
              terminal del backend.
            </div>
          )}

          <div className="actions">
            <button type="button" className="btn btn--ghost" onClick={handleRestart} disabled={busy}>
              {busy ? 'Procesando...' : 'Reconectar'}
            </button>
            <button type="button" className="btn btn--outline" onClick={handleLogout} disabled={busy}>
              Vincular otro número
            </button>
          </div>
        </article>

        <article className="card">
          <div className="card__head">
            <h2>Enviar mensaje de prueba</h2>
          </div>

          <form onSubmit={handleSend} className="form">
            <label htmlFor="to">Número destino</label>
            <input
              id="to"
              name="to"
              type="tel"
              inputMode="numeric"
              placeholder="584144979139"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              autoComplete="off"
            />
            <small>Formato internacional, solo dígitos. Sin +, espacios ni guiones.</small>

            <label htmlFor="message">Mensaje</label>
            <textarea
              id="message"
              name="message"
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />

            <button type="submit" className="btn btn--primary" disabled={!canSend}>
              {sending ? 'Enviando...' : 'Enviar WhatsApp'}
            </button>

            {!status.connected && (
              <small className="form__warning">
                El botón se habilita cuando el dispositivo esté conectado.
              </small>
            )}
          </form>

          {result && (
            <div
              className={`notice notice--${result.type}`}
              role={result.type === 'error' ? 'alert' : 'status'}
            >
              <strong>{result.title}.</strong> {result.text}
            </div>
          )}
        </article>
      </section>

      <p className="footnote">
        Esta prueba usa una sesión no oficial de WhatsApp Web (Baileys). Úsala para mensajes
        transaccionales y moderados: el envío masivo o a desconocidos puede provocar restricciones en
        el número emisor. Mantén el teléfono con internet.
      </p>
    </main>
  );
}
