import { useState } from "react";
import { Send } from "lucide-react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { TextArea } from "../../../components/ui/TextArea";
import { WS_URL } from "../constants";

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

export function EnviarMensajePrueba({
  initialTo = "",
  initialMessage = "",
  showTitle = true,
}) {
  const [to, setTo] = useState(initialTo || "");
  const [message, setMessage] = useState(
    initialMessage || "Mensaje de prueba desde el panel de WhatsApp."
  );
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const cleanPhone = to.replace(/\D/g, "");
  const canSend = !sending && cleanPhone.length >= 8 && message.trim().length > 0;

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setResult(null);
    try {
      const data = await wsApi("/api/whatsapp/send", {
        method: "POST",
        body: JSON.stringify({ to: cleanPhone, message }),
      });
      setResult({
        type: "success",
        text: `${data.message || "Mensaje enviado."} Destino: ${data.to || cleanPhone}${data.messageId ? ` · ID: ${data.messageId}` : ""}`,
      });
    } catch (error) {
      setResult({ type: "error", text: error.message || "No se pudo enviar." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      {showTitle ? <h2 className="text-sm font-semibold text-slate-900">Enviar mensaje de prueba</h2> : null}
      <div className="space-y-4">
        <Input
          label="Número destino"
          type="tel"
          inputMode="numeric"
          placeholder="584141234567"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          hint="Formato internacional, solo dígitos (sin +, espacios ni guiones)."
          autoComplete="off"
        />
        <TextArea
          label="Mensaje"
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <Button type="button" onClick={handleSend} disabled={!canSend} loading={sending} icon={<Send className="h-4 w-4" />}>
          Enviar WhatsApp
        </Button>
      </div>

      {result ? (
        <Alert tone={result.type === "success" ? "success" : result.type === "error" ? "error" : "info"}>
          {result.text}
        </Alert>
      ) : null}
    </div>
  );
}
