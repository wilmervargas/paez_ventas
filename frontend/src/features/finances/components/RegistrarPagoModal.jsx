import { useEffect, useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Select } from "../../../components/ui/Select";
import { TextArea } from "../../../components/ui/TextArea";
import { BANCOS_VE } from "../../../lib/banks-ve";
import { formatDate } from "../../../lib/dates";
import { formatInputDecimal } from "../../../lib/decimal";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney, formatRate } from "../../../lib/money";
import { useTasaVigente } from "../../orders/hooks";
import { useRegistrarPago } from "../hooks";

function parseDecimalInput(v) {
  if (v === null || v === undefined || v === "") return 0;
  let s = String(v).trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatNumEs(value, decimals = 2) {
  return Number(value || 0).toLocaleString("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function divisaContratada(deuda) {
  if (deuda?.moneda === "USD") return "USD";
  if (deuda?.moneda === "EUR") return "EUR";
  if (deuda?.moneda === "USDT") return "USDT";
  if (deuda?.moneda === "AJU") return "AJU";
  const tasaDoc = Number(deuda?.tasa_cambio || 0);
  const tasaBcv = Number(deuda?.tasa_bcv || 0);
  if (deuda?.moneda === "VES" && tasaBcv > 0 && Math.abs(tasaDoc - tasaBcv) < 0.000001) return "USD";
  return "USD";
}

function montoEnDivisa(deuda, monto) {
  const valor = Number(monto || 0);
  const divisa = divisaContratada(deuda);
  if (deuda?.moneda === "USD") return `${formatNumEs(valor)} ${divisa}`;
  const tasa = Number(deuda?.tasa_cambio || 0);
  if (!(tasa > 0)) return "—";
  const eq = valor / tasa;
  if (!Number.isFinite(eq)) return "—";
  return `${formatNumEs(eq)} ${divisa}`;
}

export function RegistrarPagoModal({ deuda, onClose, liquidarCuotaSiempre = false }) {
  const mutation = useRegistrarPago();
  const tasaAjuHoy = useTasaVigente("VES", "AJU");
  const [error, setError] = useState(null);

  const cuotaAPagar =
    deuda.proxima_cuota ||
    (Array.isArray(deuda.cuotas) ? deuda.cuotas.find((c) => Number(c.saldo || 0) > 0) : null);
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10));
  const [metodo, setMetodo] = useState("pago_movil");
  const [referencia, setReferencia] = useState("");
  const [banco, setBanco] = useState("");
  const [telefonoOrigen, setTelefonoOrigen] = useState(deuda.cliente_telefono || "");
  const [nota, setNota] = useState("");
  const [tasaAjuInput, setTasaAjuInput] = useState("");
  const [tasaManual, setTasaManual] = useState(false);

  useEffect(() => {
    if (!tasaManual && tasaAjuHoy.data?.tasa) {
      setTasaAjuInput(formatInputDecimal(String(tasaAjuHoy.data.tasa), 2));
    }
  }, [tasaAjuHoy.data?.tasa, tasaManual]);

  const divisa = divisaContratada(deuda);
  const tasaAjuVigenteNum = parseDecimalInput(tasaAjuHoy.data?.tasa ?? "0");
  const tasaAjuNum = parseDecimalInput(tasaAjuInput || "0");
  const montoCuotaDocNum = parseDecimalInput(cuotaAPagar?.saldo ?? cuotaAPagar?.monto ?? deuda.saldo ?? "0");
  const montoCuotaDocStr = String(cuotaAPagar?.saldo ?? cuotaAPagar?.monto ?? deuda.saldo ?? "0");
  const tasaDoc = Number(deuda.tasa_cambio || 0);
  const montoCuotaDivisaNum =
    deuda.moneda === "USD"
      ? montoCuotaDocNum
      : tasaDoc > 0
        ? montoCuotaDocNum / tasaDoc
        : 0;

  // Monto recibido/cobrado en VES según tasa de cobro (AJU): equivalente en divisa * tasa AJU
  const totalVesNum = montoCuotaDivisaNum * tasaAjuNum;
  const totalVes = formatInputDecimal(String(totalVesNum || 0), 2);
  // Monto esperado en VES a tasa vigente (referencia)
  const esperadoVesVigenteNum = montoCuotaDivisaNum * tasaAjuVigenteNum;
  const diferenciaVes = totalVesNum - esperadoVesVigenteNum;
  const hayDiferencia =
    tasaAjuVigenteNum > 0 && tasaAjuNum > 0 && Math.abs(diferenciaVes) > 0.05;
  const aplicarCompleto = liquidarCuotaSiempre || tasaManual || hayDiferencia;

  useEffect(() => {
    if (metodo === "efectivo") {
      setBanco("");
      setReferencia("");
    } else if (metodo === "zelle") {
      setBanco("");
    }
  }, [metodo]);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    const normDec = (v) => {
      if (v === null || v === undefined || v === "") return v;
      let s = String(v).trim();
      if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
      return s;
    };
    if (!(tasaAjuNum > 0)) {
      setError("Indica la tasa de cobro (AJU) para calcular el cobro.");
      return;
    }
    if (!(montoCuotaDivisaNum > 0)) {
      setError("No se pudo determinar el monto de la cuota en la divisa contratada.");
      return;
    }
    try {
      // En Cobros (o con tasa ajustada/diferente) se imputa como pago completo de la cuota
      // (aplicación = saldo de la cuota en moneda del documento), aunque el Bs recibido difiera.
      const montoAplicar = aplicarCompleto ? montoCuotaDocStr : normDec(totalVes);
      const montoRecibido = normDec(totalVes);
      const tasaUsada = normDec(formatInputDecimal(String(tasaAjuNum), 6));
      await mutation.mutateAsync({
        deuda_id: deuda.id,
        fecha_pago: fechaPago,
        metodo,
        referencia,
        banco,
        telefono_origen: telefonoOrigen,
        monto: String(montoAplicar),
        moneda: deuda.moneda || "VES",
        tasa_cambio: normDec(formatInputDecimal(String(deuda.tasa_cambio || "1"), 6)),
        monto_recibido_bs: montoRecibido,
        tasa_usada_bs: tasaUsada,
        nota,
        aplicar_completo: aplicarCompleto,
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo registrar el pago."));
    }
  }

  const saldoDivisaTexto = montoEnDivisa(deuda, deuda.saldo);
  const cuotaMontoDivisaTexto = cuotaAPagar
    ? montoEnDivisa(deuda, cuotaAPagar.monto ?? cuotaAPagar.saldo ?? "0")
    : null;
  const cuotaSaldoDivisaTexto = cuotaAPagar
    ? montoEnDivisa(deuda, cuotaAPagar.saldo ?? cuotaAPagar.monto ?? "0")
    : null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar pago"
      description={`${deuda.cliente_nombre} · ${deuda.pedido_numero} · Saldo ${saldoDivisaTexto}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="form-registro-pago" loading={mutation.isPending}>Registrar pago</Button>
        </div>
      }
    >
      <form id="form-registro-pago" onSubmit={onSubmit} className="space-y-4 text-sm">
        {error ? <Alert tone="error">{error}</Alert> : null}

        {cuotaAPagar ? (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
            <p className="text-sm font-semibold text-slate-900">Cuota a cancelar</p>
            <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
              <p><span className="text-slate-500">Cuota:</span> <strong>#{cuotaAPagar.numero}</strong></p>
              <p>
                <span className="text-slate-500">Estado:</span>{" "}
                <Badge tone={cuotaAPagar.vencida ? "danger" : cuotaAPagar.estado === "parcial" ? "warning" : "info"}>
                  {cuotaAPagar.estado_display || cuotaAPagar.estado || "Pendiente"}
                </Badge>
              </p>
              <p><span className="text-slate-500">Monto de la cuota:</span> <strong>{cuotaMontoDivisaTexto}</strong></p>
              <p><span className="text-slate-500">Saldo pendiente:</span> <strong>{cuotaSaldoDivisaTexto}</strong></p>
              <p className="sm:col-span-2">
                <span className="text-slate-500">Fecha de vencimiento:</span>{" "}
                <strong>{cuotaAPagar.fecha_vencimiento ? formatDate(cuotaAPagar.fecha_vencimiento) : "—"}</strong>
              </p>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {liquidarCuotaSiempre
                ? "Este pago se registrará como único y liquidará la cuota completa, aunque el monto/tasa recibido sea distinto."
                : "Esta es la cuota a la que se aplicará el pago (la más antigua pendiente). Si el monto excede su saldo, el resto se aplicará a las siguientes cuotas."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-900">Monto a cancelar</p>
            <p className="mt-1 text-sm text-slate-700">Saldo pendiente de la deuda: <strong>{saldoDivisaTexto}</strong></p>
          </div>
        )}

        <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3 space-y-2">
          <p className="text-sm font-semibold text-rose-800">Tasa de cobro (AJU)</p>
          <Input
            label="Tasa de cobro (Bs por 1 AJU)"
            type="text"
            value={tasaAjuInput}
            onChange={(e) => {
              setTasaManual(true);
              setTasaAjuInput(e.target.value);
            }}
            placeholder={tasaAjuHoy.data?.tasa ? formatInputDecimal(String(tasaAjuHoy.data.tasa), 2) : "0,00"}
            hint={
              tasaAjuVigenteNum > 0
                ? `Tasa vigente: ${formatRate(tasaAjuHoy.data.tasa)} por 1 AJU. Puedes ajustarla manualmente si el cobro se pactó a otra tasa.`
                : "Ingresa la tasa de cobro (AJU)."
            }
          />
          <div className="grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
            <p><span className="text-slate-500">Cuota a cobrar ({divisa}):</span> <strong>{montoCuotaDivisaNum > 0 ? `${formatNumEs(montoCuotaDivisaNum)} ${divisa}` : "—"}</strong></p>
            <p><span className="text-slate-500">Monto recibido (Bs):</span> <strong>{tasaAjuNum > 0 && montoCuotaDivisaNum > 0 ? formatMoney(totalVes, "VES") : "—"}</strong></p>
          </div>
          {hayDiferencia ? (
            <Alert tone={diferenciaVes < 0 ? "warning" : "info"}>
              {diferenciaVes < 0
                ? `El monto a recibir es menor que el calculado a tasa vigente (${formatMoney(String(Math.abs(diferenciaVes)), "VES")} menos).`
                : `El monto a recibir es mayor que el calculado a tasa vigente (${formatMoney(String(Math.abs(diferenciaVes)), "VES")} más).`}{" "}
              El pago se imputará como <strong>cuota completa</strong> (se reducirá el saldo total de la cuota), independientemente de la diferencia por tasa.
            </Alert>
          ) : liquidarCuotaSiempre ? (
            <Alert tone="info">
              El pago se registrará como único y se imputará como <strong>cuota completa</strong>, aunque el monto/tasa recibido sea distinto.
            </Alert>
          ) : null}
        </div>

        <Alert tone="info">
          El pago se aplica automáticamente a la(s) cuota(s) pendiente(s) más antigua(s). Si es en efectivo y hay una caja abierta, el cobro entra al arqueo; si no, el pago se registra igual sin movimiento de caja.
        </Alert>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Fecha de pago" type="date" required value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
          <Select label="Método" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
            <option value="pago_movil">Pago móvil</option>
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="zelle">Zelle</option>
            <option value="otro">Otro</option>
          </Select>
          <Input
            label="Teléfono del cliente (origen)"
            value={telefonoOrigen}
            onChange={(e) => setTelefonoOrigen(e.target.value)}
            placeholder="584141234567"
          />
          {["pago_movil", "transferencia", "otro"].includes(metodo) ? (
            <Select
              label="Banco (importante)"
              value={banco}
              onChange={(e) => setBanco(e.target.value)}
            >
              <option value="">Selecciona banco...</option>
              {BANCOS_VE.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </Select>
          ) : null}
          {metodo !== "efectivo" ? (
            <Input
              label={metodo === "zelle" ? "Referencia / Código de confirmación (Zelle)" : "Referencia / Nº operación"}
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          ) : null}
        </div>

        <TextArea label="Nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
      </form>
    </Modal>
  );
}
