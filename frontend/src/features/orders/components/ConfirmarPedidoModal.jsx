import { CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { toApiDecimal } from "../../../lib/decimal";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { useConfirmarPedido } from "../hooks";

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysISO(isoDate, days) {
  if (!isoDate) return todayISO();
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseNum(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function fmt(n) {
  return (Number.isFinite(Number(n)) ? Number(n) : 0).toFixed(2).replace(".", ",");
}
function ajustarPlan(rows, total) {
  const t = +parseNum(total).toFixed(2);
  if (!rows.length) return rows;
  const next = rows.map((r, i) => ({ numero: i + 1, fecha_vencimiento: r.fecha_vencimiento, monto: fmt(Math.max(0, parseNum(r.monto))) }));
  const sumaSinUlt = next.slice(0, -1).reduce((a, r) => a + parseNum(r.monto), 0);
  next[next.length - 1].monto = fmt(Math.max(0, +(t - sumaSinUlt).toFixed(2)));
  let diff = +(t - next.reduce((a, r) => a + parseNum(r.monto), 0)).toFixed(2);
  if (diff !== 0) {
    next[next.length - 1].monto = fmt(Math.max(0, parseNum(next[next.length - 1].monto) + diff));
    diff = +(t - next.reduce((a, r) => a + parseNum(r.monto), 0)).toFixed(2);
    if (Math.abs(diff) > 0.0001) {
      for (let i = next.length - 1; i >= 0 && Math.abs(diff) > 0.0001; i--) {
        const nv = +(parseNum(next[i].monto) + diff).toFixed(2);
        if (nv >= 0) { next[i].monto = fmt(nv); diff = +(t - next.reduce((a, r) => a + parseNum(r.monto), 0)).toFixed(2); }
      }
    }
  }
  return next;
}
function buildPlan(pedido, fechaPrimera) {
  const n = Math.max(1, Math.min(8, Number(pedido.numero_cuotas || 1)));
  const total = String(pedido.total ?? "0");
  const existing = Array.isArray(pedido.plan_cuotas) ? pedido.plan_cuotas : [];
  const start = fechaPrimera || pedido.fecha_primera_cuota || pedido.fecha || todayISO();
  const rows = Array.from({ length: n }, (_, i) => {
    const ex = existing[i];
    return {
      numero: i + 1,
      fecha_vencimiento: ex?.fecha_vencimiento || addDaysISO(start, 7 * i),
      monto: ex?.monto != null ? fmt(parseNum(ex.monto)) : "",
    };
  });
  if (rows.every((r) => r.monto === "")) {
    const t = parseNum(total);
    const base = Math.floor((t / n) * 100) / 100;
    let acc = 0;
    rows.forEach((r, i) => {
      if (i === n - 1) r.monto = fmt(+(t - acc).toFixed(2));
      else { r.monto = fmt(base); acc += base; }
    });
  }
  return ajustarPlan(rows, total);
}

export function ConfirmarPedidoModal({ pedido, onClose, onConfirmed }) {
  const mutation = useConfirmarPedido();
  const esCredito = pedido.tipo_pago === "credito";

  const [error, setError] = useState(null);
  const [fechaPrimera, setFechaPrimera] = useState(() => pedido.fecha_primera_cuota || pedido.fecha || todayISO());
  const [plan, setPlan] = useState(() => buildPlan(pedido, pedido.fecha_primera_cuota || pedido.fecha || todayISO()));

  useEffect(() => {
    const fp = pedido.fecha_primera_cuota || pedido.fecha || todayISO();
    setFechaPrimera(fp);
    setPlan(buildPlan(pedido, fp));
  }, [pedido]);

  function onChangeFechaPrimera(v) {
    setFechaPrimera(v);
    setPlan((prev) => ajustarPlan(prev.map((r, i) => ({ ...r, fecha_vencimiento: r.fecha_vencimiento || addDaysISO(v, 7 * i) })), pedido.total));
  }
  function updateCuota(index, patch) {
    setPlan((prev) => ajustarPlan(prev.map((r, i) => (i === index ? { ...r, ...patch } : r)), pedido.total));
  }
  function recalcularFechas() {
    const fp = fechaPrimera || todayISO();
    setPlan((prev) => ajustarPlan(prev.map((r, i) => ({ ...r, fecha_vencimiento: addDaysISO(fp, 7 * i) })), pedido.total));
  }

  async function confirmar() {
    setError(null);
    try {
      const payload = {};
      if (esCredito) {
        payload.numero_cuotas = plan.length;
        payload.fecha_primera_cuota = fechaPrimera;
        payload.plan_cuotas = plan.map((c, i) => ({
          numero: i + 1,
          fecha_vencimiento: c.fecha_vencimiento,
          monto: toApiDecimal(c.monto, 2),
        }));
      }
      const confirmado = await mutation.mutateAsync({ id: pedido.id, ...payload });
      onClose();
      onConfirmed?.(confirmado);
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo confirmar el pedido."));
    }
  }

  const suma = (plan || []).reduce((a, r) => a + parseNum(r.monto), 0);

  return (
    <Modal
      open
      onClose={onClose}
      size={esCredito ? "lg" : "md"}
      title={`Confirmar ${pedido.numero}`}
      description={`${pedido.cliente_nombre} · ${formatMoney(pedido.total, pedido.moneda)}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="button" loading={mutation.isPending} onClick={() => void confirmar()} icon={<CheckCircle2 className="h-4 w-4" />}>
            Confirmar pedido
          </Button>
        </div>
      }
    >
      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}

      {esCredito ? (
        <div className="space-y-5">
          <Alert tone="info">
            Pedido a crédito: define la fecha de la primera cuota y ajusta fechas/montos por cuota (vencimiento semanal por defecto). La última cuota se ajusta automáticamente al total del pedido.
          </Alert>

          <div className="flex flex-wrap items-end gap-3">
            <div className="max-w-xs">
              <Input label="Fecha primera cuota" type="date" value={fechaPrimera} onChange={(e) => onChangeFechaPrimera(e.target.value)} />
            </div>
            <Button type="button" variant="secondary" className="mb-0.5" onClick={recalcularFechas}>Recalcular fechas semanales</Button>
          </div>

          <div className="rounded-xl border border-slate-200">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Plan de cuotas</p>
              <p className="text-xs text-slate-500">
                {plan.length} {plan.length === 1 ? "cuota" : "cuotas"} · total {formatMoney(pedido.total, pedido.moneda)} · montos en {pedido.moneda}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Cuota</th>
                    <th className="px-4 py-2 font-semibold">Fecha de cobro</th>
                    <th className="px-4 py-2 font-semibold">Monto ({pedido.moneda})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plan.map((c, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 font-medium text-slate-900">#{idx + 1}</td>
                      <td className="px-4 py-2"><input type="date" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={c.fecha_vencimiento || ""} onChange={(e) => updateCuota(idx, { fecha_vencimiento: e.target.value })} /></td>
                      <td className="px-4 py-2"><input type="text" inputMode="decimal" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={c.monto ?? ""} onChange={(e) => updateCuota(idx, { monto: e.target.value })} onBlur={(e) => updateCuota(idx, { monto: fmt(parseNum(e.target.value)) })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-slate-500">Suma cuotas: <strong>{fmt(suma)} {pedido.moneda}</strong> (ajustada automáticamente al total). Al confirmar se descuenta inventario y se genera la deuda con este plan.</p>
        </div>
      ) : (
        <>
          <Alert tone="info">Al confirmar se descontará el inventario de las líneas del pedido. Este pedido es de contado. Un pedido confirmado no se edita: para corregirlo debe anularse y crearse uno nuevo.</Alert>
          <div className="mt-4 rounded-xl border border-slate-200 p-4 text-sm">
            <p className="font-semibold text-slate-900">{pedido.lineas.length} líneas</p>
            <p className="mt-1 text-slate-600">{pedido.lineas.map((l) => l.descripcion || l.producto_nombre || l.combo_nombre).filter(Boolean).join(", ")}</p>
          </div>
        </>
      )}
    </Modal>
  );
}
