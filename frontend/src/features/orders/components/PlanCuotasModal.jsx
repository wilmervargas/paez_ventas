import { Calculator, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { toApiDecimal } from "../../../lib/decimal";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { usePatchPedido } from "../hooks";

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
function parseUsdTotal(pedido) {
  const v = pedido?.total_usd;
  if (v == null || v === "") return null;
  const n = parseNum(v);
  return Number.isFinite(n) ? n : null;
}
function cuotasUsd(rows, totalUsd) {
  if (totalUsd == null || !Array.isArray(rows) || rows.length === 0) return rows.map(() => null);
  const t = +Number(totalUsd).toFixed(2);
  const totalMoneda = rows.reduce((a, r) => a + parseNum(r.monto), 0);
  let acc = 0;
  const out = rows.map((_, i) => {
    if (i === rows.length - 1) return +(t - acc).toFixed(2);
    let val;
    if (totalMoneda > 0.0001) {
      val = +((t * parseNum(rows[i].monto)) / totalMoneda).toFixed(2);
    } else {
      const base = Math.floor((t / rows.length) * 100) / 100;
      val = base;
    }
    acc = +(acc + val).toFixed(2);
    return val;
  });
  let diff = +(t - out.reduce((a, v) => a + v, 0)).toFixed(2);
  if (diff !== 0 && out.length) out[out.length - 1] = +(out[out.length - 1] + diff).toFixed(2);
  return out;
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
function planIgual(pedido, n, fechaPrimera) {
  const count = Math.max(1, Math.min(10, Number(n || 1)));
  const start = fechaPrimera || addDaysISO(todayISO(), 7);
  const totalNum = parseNum(pedido.total);
  const base = Math.floor((totalNum / count) * 100) / 100;
  let acc = 0;
  const rows = Array.from({ length: count }, (_, i) => {
    let monto;
    if (i === count - 1) monto = +(totalNum - acc).toFixed(2);
    else { monto = +base.toFixed(2); acc += monto; }
    return { numero: i + 1, fecha_vencimiento: addDaysISO(start, 7 * i), monto: fmt(Math.max(0, monto)) };
  });
  return ajustarPlan(rows, pedido.total);
}

export function PlanCuotasModal({ pedido, onClose }) {
  const mutation = usePatchPedido();
  const [error, setError] = useState(null);
  const [fechaPrimera, setFechaPrimera] = useState(() => addDaysISO(todayISO(), 7));
  const [numeroCuotas, setNumeroCuotas] = useState(() => Math.max(1, Math.min(10, Number(pedido.numero_cuotas || 1))));
  const [plan, setPlan] = useState(() => planIgual(pedido, Math.max(1, Math.min(10, Number(pedido.numero_cuotas || 1))), addDaysISO(todayISO(), 7)));

  // Al entrar: primera cuota = hoy + 7 días, cuotas iguales (total / n), semanales.
  useEffect(() => {
    const fp = addDaysISO(todayISO(), 7);
    const n = Math.max(1, Math.min(10, Number(pedido.numero_cuotas || 1)));
    setFechaPrimera(fp);
    setNumeroCuotas(n);
    setPlan(planIgual(pedido, n, fp));
  }, [pedido]);

  function regenerar(nuevoN = numeroCuotas, fp = fechaPrimera) {
    const n = Math.max(1, Math.min(10, Number(nuevoN || 1)));
    const start = fp || addDaysISO(todayISO(), 7);
    setPlan(planIgual(pedido, n, start));
  }

  function onChangeNumero(v) {
    const n = Math.max(1, Math.min(10, Number(v || 1)));
    setNumeroCuotas(n);
    regenerar(n, fechaPrimera);
  }
  function onChangeFechaPrimera(v) {
    setFechaPrimera(v);
    // Al editar la fecha de la primera cuota se recalculan fechas (semanales) y montos (iguales).
    setPlan(planIgual(pedido, numeroCuotas, v));
  }
  function updateCuota(index, patch) {
    setPlan((prev) => ajustarPlan(prev.map((r, i) => (i === index ? { ...r, ...patch } : r)), pedido.total));
  }
  function recalcularFechas() {
    // Recalcula fechas (semanales desde la primera) y montos iguales.
    setPlan(planIgual(pedido, plan.length || numeroCuotas, fechaPrimera || addDaysISO(todayISO(), 7)));
  }

  async function guardar() {
    setError(null);
    try {
      await mutation.mutateAsync({
        id: pedido.id,
        payload: {
          numero_cuotas: plan.length,
          fecha_primera_cuota: fechaPrimera,
          plan_cuotas: plan.map((c, i) => ({
            numero: i + 1,
            fecha_vencimiento: c.fecha_vencimiento,
            monto: toApiDecimal(c.monto, 2),
          })),
        },
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo guardar el plan de cuotas."));
    }
  }

  const suma = (plan || []).reduce((a, r) => a + parseNum(r.monto), 0);
  const totalUsd = parseUsdTotal(pedido);
  const usdPorCuota = cuotasUsd(plan || [], totalUsd);
  const sumaUsd = usdPorCuota.reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Plan de cuotas · ${pedido.numero}`}
      description={`${pedido.cliente_nombre} · ${formatMoney(pedido.total, pedido.moneda)}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="button" loading={mutation.isPending} onClick={() => void guardar()} icon={<Save className="h-4 w-4" />}>Guardar plan</Button>
        </div>
      }
    >
      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}
      <div className="space-y-5">
        <Alert tone="info">Define y guarda el plan de cuotas del pedido a crédito (separado de la confirmación). La primera cuota inicia una semana después de la fecha actual y las fechas se calculan semanalmente; todas las cuotas son iguales (total / nº cuotas). Puedes editar la fecha inicial y recalcular. Al confirmar se usará este plan para generar la deuda.</Alert>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <Input label="Nº cuotas" type="number" min={1} max={10} value={numeroCuotas} onChange={(e) => onChangeNumero(e.target.value)} />
          </div>
          <div className="max-w-xs">
            <Input label="Fecha primera cuota" type="date" value={fechaPrimera} onChange={(e) => onChangeFechaPrimera(e.target.value)} />
          </div>
          <Button type="button" variant="secondary" className="mb-0.5" onClick={() => regenerar()} icon={<Calculator className="h-4 w-4" />}>Recalcular cuotas</Button>
          <Button type="button" variant="secondary" className="mb-0.5" onClick={recalcularFechas}>Recalcular fechas semanales</Button>
        </div>

        <div className="rounded-xl border border-slate-200">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Plan de cuotas</p>
            <p className="text-xs text-slate-500">
              {plan.length} {plan.length === 1 ? "cuota" : "cuotas"} · total {formatMoney(pedido.total, pedido.moneda)}
              {totalUsd != null ? ` (${fmt(sumaUsd)} USD)` : ""} · montos en {pedido.moneda}{totalUsd != null ? " y USD" : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Cuota</th>
                  <th className="px-4 py-2 font-semibold">Fecha de cobro</th>
                  <th className="px-4 py-2 font-semibold">Monto ({pedido.moneda})</th>
                  <th className="px-4 py-2 font-semibold">Monto (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plan.map((c, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2 font-medium text-slate-900">#{idx + 1}</td>
                    <td className="px-4 py-2"><input type="date" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={c.fecha_vencimiento || ""} onChange={(e) => updateCuota(idx, { fecha_vencimiento: e.target.value })} /></td>
                    <td className="px-4 py-2"><input type="text" inputMode="decimal" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={c.monto ?? ""} onChange={(e) => updateCuota(idx, { monto: e.target.value })} onBlur={(e) => updateCuota(idx, { monto: fmt(parseNum(e.target.value)) })} /></td>
                    <td className="px-4 py-2 text-slate-700">{usdPorCuota[idx] != null ? `${fmt(usdPorCuota[idx])} USD` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Suma cuotas: <strong>{fmt(suma)} {pedido.moneda}</strong>
          {totalUsd != null ? <> · <strong>{fmt(sumaUsd)} USD</strong></> : null}
          {" "}(ajustada automáticamente al total). Guarda el plan para usarlo al confirmar el pedido.
        </p>
      </div>
    </Modal>
  );
}
