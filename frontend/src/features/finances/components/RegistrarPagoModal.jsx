import { useEffect, useMemo, useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Select } from "../../../components/ui/Select";
import { TextArea } from "../../../components/ui/TextArea";
import { api } from "../../../lib/api";
import { toDisplayDecimal } from "../../../lib/decimal";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { EnviarMensajePrueba } from "../../whatsapp/components/EnviarMensajePrueba";
import { useRegistrarPago } from "../hooks";

export function RegistrarPagoModal({ deuda, onClose }) {
  const mutation = useRegistrarPago();
  const [error, setError] = useState(null);
  const [tasaVigenteBs, setTasaVigenteBs] = useState(null);

  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10));
  const [metodo, setMetodo] = useState("pago_movil");
  const [referencia, setReferencia] = useState("");
  const [banco, setBanco] = useState("");
  const [telefonoOrigen, setTelefonoOrigen] = useState("");
  const [monto, setMonto] = useState(() => String(deuda.proxima_cuota?.saldo ?? deuda.saldo ?? ""));
  const [moneda, setMoneda] = useState(deuda.moneda || "USD");
  const [tasaCambio, setTasaCambio] = useState(String(deuda.tasa_cambio || "1"));
  const [montoRecibidoBs, setMontoRecibidoBs] = useState("");
  const [tasaUsadaBs, setTasaUsadaBs] = useState("");
  const [nota, setNota] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get("/tasas-cambio/vigente/", { params: { moneda: "VES", base: "USD" } });
        if (alive && data?.tasa) {
          setTasaVigenteBs(String(data.tasa));
          setTasaUsadaBs(String(data.tasa));
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  const esperadoBs = useMemo(() => {
    const m = parseFloat(monto || "0");
    const t = parseFloat(tasaUsadaBs || "0");
    if (!m || !t) return null;
    if (moneda === "USD") return m * t;
    if (moneda === "VES") return m;
    return null;
  }, [monto, tasaUsadaBs, moneda]);

  const diferenciaBs = useMemo(() => {
    if (esperadoBs == null || !montoRecibidoBs) return null;
    return parseFloat(montoRecibidoBs) - esperadoBs;
  }, [esperadoBs, montoRecibidoBs]);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await mutation.mutateAsync({
        deuda_id: deuda.id,
        fecha_pago: fechaPago,
        metodo,
        referencia,
        banco,
        telefono_origen: telefonoOrigen,
        monto,
        moneda,
        tasa_cambio: tasaCambio,
        monto_recibido_bs: montoRecibidoBs || null,
        tasa_usada_bs: tasaUsadaBs || null,
        nota,
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo registrar el pago."));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar pago"
      description={`${deuda.cliente_nombre} · ${deuda.pedido_numero} · Saldo ${formatMoney(deuda.saldo, deuda.moneda)}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-registro-pago" loading={mutation.isPending}>Registrar pago</Button>
        </div>
      }
    >
      <form id="form-registro-pago" onSubmit={onSubmit} className="space-y-4 text-sm">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Alert tone="info">El pago se aplica automáticamente a la(s) cuota(s) pendiente(s) más antigua(s). Si es en efectivo, requiere una sesión de caja abierta.</Alert>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Fecha de pago" type="date" required value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
          <Select label="Método" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option value="pago_movil">Pago móvil</option>
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="zelle">Zelle</option>
            <option value="otro">Otro</option>
          </Select>
          <Input label="Banco" value={banco} onChange={(e) => setBanco(e.target.value)} />
          <Input label="Referencia / Nº operación" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
          <Input label="Teléfono de origen (transferencia/pago móvil)" value={telefonoOrigen} onChange={(e) => setTelefonoOrigen(e.target.value)} placeholder="584141234567" />
          <Input label={`Monto (${moneda})`} type="text" inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} />
          <Select label="Moneda" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            <option value="USD">USD</option>
            <option value="VES">VES</option>
            <option value="EUR">EUR</option>
            <option value="USDT">USDT</option>
          </Select>
          <Input label="Tasa de cambio (del pago)" type="text" inputMode="decimal" value={tasaCambio} onChange={(e) => setTasaCambio(e.target.value)} />
          <Input label="Tasa Bs/USD usada" type="text" inputMode="decimal" value={tasaUsadaBs} onChange={(e) => setTasaUsadaBs(e.target.value)} placeholder={tasaVigenteBs || "tasa BCV"} />
          <Input label="Monto recibido en Bs" type="text" inputMode="decimal" value={montoRecibidoBs} onChange={(e) => setMontoRecibidoBs(e.target.value)} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
          <p>Tasa Bs vigente ref.: {tasaVigenteBs ? toDisplayDecimal(tasaVigenteBs, 2) : "no disponible"}</p>
          <p>Esperado en Bs (según monto y tasa usada): {esperadoBs != null ? `Bs ${toDisplayDecimal(String(esperadoBs), 2)}` : "—"}</p>
          {diferenciaBs != null ? (
            <p className={diferenciaBs < -0.05 ? "text-rose-700 font-medium" : "text-emerald-700"}>
              Diferencia: Bs {toDisplayDecimal(String(diferenciaBs), 2)} {diferenciaBs < -0.05 ? "(incompleto: se rechazará si es menor al esperado)" : "(ok/sobrante)"}
            </p>
          ) : null}
        </div>

        <TextArea label="Nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
      </form>

      <div className="mt-6 border-t border-slate-200 pt-4">
        <EnviarMensajePrueba
          initialTo={deuda.cliente_telefono || ""}
          initialMessage={`Cliente: ${deuda.cliente_nombre}\nPedido: ${deuda.pedido_numero}\nMonto: ${formatMoney(deuda.saldo, deuda.moneda)}`}
        />
      </div>
    </Modal>
  );
}
