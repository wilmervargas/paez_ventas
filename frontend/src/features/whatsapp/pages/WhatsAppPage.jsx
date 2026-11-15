import { useCallback, useEffect, useState } from "react";
import { MessageCircle, RefreshCw, Unplug } from "lucide-react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { WS_URL } from "../constants";

const STATE_LABELS = {
  starting: "Iniciando",
  connecting: "Conectando",
  qr: "Esperando QR",
  open: "Conectado",
  close: "Reconectando",
  logged_out: "Sesión cerrada",
};

async function wsApi(path, options = {}) {
  const response = await fetch(`${WS_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
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

export function WhatsAppPage() {
  const [status, setStatus] = useState({
    connected: false,
    state: "starting",
    needsQr: false,
    qrDataUrl: null,
    message: "Consultando estado...",
    lastError: null,
    me: null,
  });
  const [backendDown, setBackendDown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const refreshStatus = useCallback(async () => {
    try {
      const data = await wsApi("/api/whatsapp/status");
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

  async function handleRestart() {
    setBusy(true);
    setResult(null);
    try {
      const data = await wsApi("/api/whatsapp/restart", { method: "POST" });
      setResult({ type: "info", text: data.message || "Reconectando..." });
      void refreshStatus();
    } catch (error) {
      setResult({ type: "error", text: error.message || "Error al reconectar." });
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    const confirmed = window.confirm(
      "Esto cerrará la sesión actual y borrará las credenciales guardadas. Tendrás que escanear un QR nuevo.\n\n¿Continuar?"
    );
    if (!confirmed) return;
    setBusy(true);
    setResult(null);
    try {
      const data = await wsApi("/api/whatsapp/logout", { method: "POST" });
      setResult({ type: "info", text: data.message || "Sesión cerrada." });
      void refreshStatus();
    } catch (error) {
      setResult({ type: "error", text: error.message || "Error al cerrar sesión." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={MessageCircle}
        title="WhatsApp"
        description="Estado de la conexión del servicio local ws/ (Baileys)."
      />

      <Card className="p-5 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Estado de la conexión</h2>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              status.connected
                ? "bg-emerald-100 text-emerald-700"
                : status.needsQr
                  ? "bg-amber-100 text-amber-700"
                  : "bg-slate-100 text-slate-700"
            }`}
          >
            {STATE_LABELS[status.state] || status.state || "—"}
          </span>
        </div>

        <p className="text-xs text-slate-500">Servicio: <code>{WS_URL}</code></p>

        <p className={`text-sm ${status.connected ? "text-emerald-700" : "text-slate-700"}`}>
          {status.message || "—"}
        </p>
        {status.me ? (
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">Emisor vinculado:</span> +{status.me}
          </p>
        ) : null}
        {status.lastError ? <Alert tone="error">{String(status.lastError)}</Alert> : null}
        {backendDown ? (
          <Alert tone="error">
            No se pudo contactar al servicio en <code>{WS_URL}</code>. Verifica que{" "}
            <code>ws/server</code> esté ejecutándose.
          </Alert>
        ) : null}

        {status.needsQr && status.qrDataUrl ? (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <img
              src={status.qrDataUrl}
              alt="Código QR para vincular WhatsApp"
              className="mx-auto h-64 w-64 rounded-lg bg-white p-2"
            />
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
              <li>Abre WhatsApp en el teléfono emisor.</li>
              <li>
                Ve a <strong>Dispositivos vinculados</strong>.
              </li>
              <li>
                Toca <strong>Vincular un dispositivo</strong> y escanea este QR.
              </li>
            </ol>
            <p className="text-xs text-slate-500">El código se renueva automáticamente.</p>
          </div>
        ) : null}

        {status.needsQr && !status.qrDataUrl ? (
          <Alert tone="warning">
            Generando el código QR… si no aparece, pulsa <strong>Reconectar</strong> o revisa la
            consola de <code>ws/server</code>.
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={handleRestart} disabled={busy} icon={<RefreshCw className="h-4 w-4" />}>
            Reconectar
          </Button>
          <Button type="button" variant="ghost" onClick={handleLogout} disabled={busy} icon={<Unplug className="h-4 w-4" />}>
            Vincular otro número
          </Button>
        </div>

        {result ? (
          <Alert tone={result.type === "success" ? "success" : result.type === "error" ? "error" : "info"}>
            {result.text}
          </Alert>
        ) : null}
      </Card>
    </div>
  );
}
