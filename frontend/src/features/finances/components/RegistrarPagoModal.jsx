import { useEffect, useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { Select } from "../../../components/ui/Select";
import { TextArea } from "../../../components/ui/TextArea";
import { BANCOS_VE } from "../../../lib/banks-ve";
import { formatInputDecimal } from "../../../lib/decimal";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { useRegistrarPago } from "../hooks";

function parseDecimalInput(v) {
  if (v === null || v === undefined || v === "") return 0;
  let s = String(v).trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function calcularPagoEnMoneda(deuda, monedaDestino) {
  const saldoDeuda = parseDecimalInput(deuda.proxima_cuota?.saldo ?? deuda.saldo ?? "0");
  const monedaDeuda = String(deuda.moneda || "USD").toUpper();
  const tasaDeuda = parseDecimalInput(deuda.tasa_cambio || "1"); // registrada en el registro (ej. Bs por 1 monedaDeuda)
  const tasaBcv = parseDecimalInput(deuda.tasa_bcv || "0"); // Bs por 1 USD registrada
  const dest = String(monedaDestino || monedaDeuda).toUpperCase();

  if (dest === monedaDeuda) {
    return { monto: saldoDeuda, tasa: tasaDeuda };
  }
  if (dest === "VES") {
    // deuda en divisa con tasa registrada en Bs por 1 unidad de deuda.moneda
    return { monto: saldoDeuda * tasaDeuda, tasa: tasaDeuda };
  }
  if (monedaDeuda === "VES") {
    if (dest === "USD" && tasaBcv > 0) {
      return { monto: saldoDeuda / tasaBcv, tasa: tasaBcv };
    }
    return { monto: saldoDeuda, tasa: 1 };
  }
  // Conversión entre divisas usando tasas registradas en el documento (Bs por unidad)
  const totalVes = saldoDeuda * tasaDeuda;
  if (dest === "USD" && tasaBcv > 0) {
    return { monto: totalVes / tasaBcv, tasa: tasaBcv };
  }
  // Sin tasa registrada para la divisa destino: mantener equivalente en VES como referencia
  return { monto: totalVes, tasa: 1 };
}

export function RegistrarPagoModal({ deuda, onClose }) {
  const mutation = useRegistrarPago();
  const [error, setError] = useState(null);

  const saldoInicial = deuda.proxima_cuota?.saldo ?? deuda.saldo ?? "";
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10));
  const [metodo, setMetodo] = useState("pago_movil");
  const [referencia, setReferencia] = useState("");
  const [banco, setBanco] = useState("");
  const [telefonoOrigen, setTelefonoOrigen] = useState(deuda.cliente_telefono || "");
  const [monto, setMonto] = useState(() => formatInputDecimal(String(saldoInicial), 2));
  const [moneda, setMoneda] = useState(() => String(deuda.moneda || "USD").toUpperCase());
  const [tasaCambio, setTasaCambio] = useState(() => formatInputDecimal(String(deuda.tasa_cambio || "1"), 2));
  const [nota, setNota] = useState("");

  function onChangeMoneda(e) {
    const nueva = String(e.target.value || "").toUpperCase();
    setMoneda(nueva);
    const calc = calcularPagoEnMoneda(deuda, nueva);
    setMonto(formatInputDecimal(String(calc.monto || 0), 2));
    setTasaCambio(formatInputDecimal(String(calc.tasa || 1), 2));
  }

  // (eliminado fetch de tasa vigente Bs/USD y campos relacionados)

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
      if (s.includes(",")) {
        s = s.replace(/\./g, "").replace(",", ".");
      }
      return s;
    };
    try {
      await mutation.mutateAsync({
        deuda_id: deuda.id,
        fecha_pago: fechaPago,
        metodo,
        referencia,
        banco,
        telefono_origen: telefonoOrigen,
        monto: normDec(monto),
        moneda,
        tasa_cambio: normDec(tasaCambio),
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
        <Alert tone="info">
          El pago se aplica automáticamente a la(s) cuota(s) pendiente(s) más antigua(s). Si cambias la moneda de pago, el monto y la tasa se recalculan usando la tasa registrada en el documento. Si es en efectivo, requiere una sesión de caja abierta.
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
          <Input label={`Monto (${moneda})`} type="text" inputMode="decimal" required value={monto} onChange={(e) => setMonto(e.target.value)} onBlur={() => setMonto((v) => formatInputDecimal(v || "0", 2))} />
          <Select label="Moneda de pago" value={moneda} onChange={onChangeMoneda}>
            <option value="VES">VES</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="USDT">USDT</option>
          </Select>
          <Input
            label="Tasa de cambio (registrada del pedido)"
            type="text"
            inputMode="decimal"
            value={tasaCambio}
            readOnly
            title="Tasa tomada del registro del documento/deuda"
          />
        </div>

        <TextArea label="Nota" value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
      </form>
    </Modal>
  );
}
