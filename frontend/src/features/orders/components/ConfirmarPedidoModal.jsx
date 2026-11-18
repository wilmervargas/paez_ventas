import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { getErrorMessage } from "../../../lib/errors";
import { formatEsVeInput, toApiDecimal } from "../../../lib/decimal";
import { formatMoney } from "../../../lib/money";
import { formatDate } from "../../../lib/dates";
import { useConfirmarPedido } from "../hooks";

function parseNum(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(toApiDecimal(String(v)));
  return Number.isFinite(n) ? n : 0;
}
// Montos visibles siempre en formato es-VE: 1.234,56.
function fmt(n) {
  const value = Number.isFinite(Number(n)) ? Number(n) : 0;
  return formatEsVeInput(value.toFixed(2), 2) || "0,00";
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
    if (totalMoneda > 0.0001) val = +((t * parseNum(rows[i].monto)) / totalMoneda).toFixed(2);
    else val = Math.floor((t / rows.length) * 100) / 100;
    acc = +(acc + val).toFixed(2);
    return val;
  });
  let diff = +(t - out.reduce((a, v) => a + v, 0)).toFixed(2);
  if (diff !== 0 && out.length) out[out.length - 1] = +(out[out.length - 1] + diff).toFixed(2);
  return out;
}

export function ConfirmarPedidoModal({ pedido, onClose, onConfirmed }) {
  const mutation = useConfirmarPedido();
  const esCredito = pedido.tipo_pago === "credito";
  const [error, setError] = useState(null);

  const plan = Array.isArray(pedido.plan_cuotas) ? pedido.plan_cuotas : [];
  const tienePlan = plan.length > 0;
  const totalUsd = parseUsdTotal(pedido);
  const usdPorCuota = cuotasUsd(plan, totalUsd);

  async function confirmar() {
    setError(null);
    try {
      const confirmado = await mutation.mutateAsync({ id: pedido.id });
      onClose();
      onConfirmed?.(confirmado);
    } catch (err) {
      setError(getErrorMessage(err, "No se pudo confirmar el pedido."));
    }
  }

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
        <div className="space-y-4">
          <Alert tone="info">Al confirmar se descontará el inventario y se generará la deuda con el plan de cuotas guardado del pedido. Si necesitas definir o recalcular las cuotas, usa la acción <strong>Calcular cuotas</strong> en el listado (separada de confirmar).</Alert>
          {tienePlan ? (
            <div className="rounded-xl border border-slate-200">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">Plan de cuotas</p>
                <p className="text-xs text-slate-500">{plan.length} {plan.length === 1 ? "cuota" : "cuotas"} · total {formatMoney(pedido.total, pedido.moneda)}{totalUsd != null ? ` (${fmt(totalUsd)} USD)` : ""}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
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
                        <td className="px-4 py-2 font-medium text-slate-900">#{c.numero ?? idx + 1}</td>
                        <td className="px-4 py-2 text-slate-700">{c.fecha_vencimiento ? formatDate(c.fecha_vencimiento) : "—"}</td>
                        <td className="px-4 py-2 text-slate-700">{formatMoney(c.monto, pedido.moneda)}</td>
                        <td className="px-4 py-2 text-slate-700">{usdPorCuota[idx] != null ? `${fmt(usdPorCuota[idx])} USD` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <Alert tone="warning">Este pedido a crédito no tiene un plan de cuotas guardado. Puedes confirmarlo (se generará un plan por defecto) o usar <strong>Calcular cuotas</strong> en el listado para definirlo antes de confirmar.</Alert>
          )}
        </div>
      ) : (
        <>
          <Alert tone="info">Al confirmar se descontará el inventario de las líneas del pedido. Este pedido es de contado. Un pedido confirmado no se edita: para corregirlo debe anularse y crearse uno nuevo.</Alert>
          <div className="mt-4 rounded-xl border border-slate-200 p-4 text-sm">
            <p className="font-semibold text-slate-900">{(pedido.lineas || []).length} líneas</p>
            <p className="mt-1 text-slate-600">{(pedido.lineas || []).map((l) => l.descripcion || l.producto_nombre || l.combo_nombre).filter(Boolean).join(", ")}</p>
          </div>
        </>
      )}
    </Modal>
  );
}
