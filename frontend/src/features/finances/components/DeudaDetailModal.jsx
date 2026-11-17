import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { PageLoader } from "../../../components/ui/Spinner";
import { Alert } from "../../../components/ui/Alert";
import { formatDate } from "../../../lib/dates";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney, formatRate } from "../../../lib/money";
import { useDeuda } from "../hooks";

function formatNumEs(value, decimals = 2) {
  return Number(value || 0).toLocaleString("es-VE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function montoUsdCuota(deuda, cuotaMonto) {
  const monto = Number(cuotaMonto || 0);
  const tasa = Number(deuda?.tasa_cambio || 0);
  const tasaBcv = Number(deuda?.tasa_bcv || 0);
  if (deuda?.moneda === "USD") return `$ ${formatNumEs(monto)}`;
  if (deuda?.moneda === "VES" && tasa > 0) {
    const esUsdBcv = tasaBcv > 0 && Math.abs(tasa - tasaBcv) < 0.000001;
    if (esUsdBcv || Number(deuda?.tasa_bcv) > 0) {
      // Si la tasa del documento es BCV USD, el equivalente es directo; si no, se usa la tasa contratada como referencia USD base cuando aplique.
      return `$ ${formatNumEs(monto / tasa)}`;
    }
  }
  if ((deuda?.moneda === "EUR" || deuda?.moneda === "USDT") && tasa > 0) {
    // En estos casos la tasa del documento se expresa en Bs por unidad; no hay USD directo sin cruce adicional.
    return "—";
  }
  if (tasa > 0 && deuda?.moneda === "VES") return `$ ${formatNumEs(monto / tasa)}`;
  return "—";
}

export function DeudaDetailModal({ deudaId, onClose }) {
  const { data: deuda, isLoading, isError, error } = useDeuda(deudaId);
  const cuotaPendienteId =
    deuda?.proxima_cuota?.id ??
    deuda?.cuotas?.find((c) => Number(c.saldo || 0) > 0)?.id ??
    null;

  return (
    <Modal
      open
      onClose={onClose}
      title={deuda ? `Deuda · ${deuda.pedido_numero}` : "Detalle de deuda"}
      description={deuda ? `${deuda.cliente_nombre} · Saldo ${formatMoney(deuda.saldo, deuda.moneda)}` : ""}
      footer={
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      }
    >
      {isLoading ? (
        <PageLoader label="Cargando deuda..." />
      ) : isError ? (
        <Alert tone="error">{getErrorMessage(error, "No se pudo cargar la deuda.")}</Alert>
      ) : deuda ? (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-3">
            <div><p className="text-slate-500">Cliente</p><p className="font-medium">{deuda.cliente_nombre} ({deuda.cliente_codigo})</p></div>
            <div><p className="text-slate-500">Pedido</p><p className="font-medium">{deuda.pedido_numero} · {formatDate(deuda.pedido_fecha)}</p></div>
            <div><p className="text-slate-500">Total</p><p className="font-medium">{formatMoney(deuda.monto_original, deuda.moneda)}</p></div>
            <div><p className="text-slate-500">Saldo</p><p className={`font-medium ${Number(deuda.saldo || 0) > 0 ? "italic" : ""}`}><strong>{formatMoney(deuda.saldo, deuda.moneda)}</strong></p></div>
            <div><p className="text-slate-500">Pagado</p><p className="font-medium">{formatMoney(deuda.monto_pagado, deuda.moneda)}</p></div>
            <div><p className="text-slate-500">Estado</p><Badge tone={deuda.estado === "pagada" ? "success" : deuda.vencida ? "danger" : "warning"}>{deuda.estado_display}</Badge></div>
          </div>

          <div>
            <h4 className="mb-2 font-semibold text-slate-900">Plan de cuotas ({deuda.cuotas_total})</h4>
            {deuda.cuotas?.length ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Cuota</th>
                      <th className="px-3 py-2">Fecha de cobro</th>
                      <th className="px-3 py-2">Monto ({deuda.moneda})</th>
                      <th className="px-3 py-2">Monto (USD)</th>
                      <th className="px-3 py-2">Saldo (USD)</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deuda.cuotas.map((c) => {
                      const pendientePorPagar = cuotaPendienteId != null && c.id === cuotaPendienteId && Number(c.saldo || 0) > 0;
                      const em = pendientePorPagar ? "italic font-bold" : "";
                      return (
                        <tr key={c.id} className={pendientePorPagar ? "bg-amber-50/60" : undefined}>
                          <td className={`px-3 py-2 font-medium ${em}`}>#{c.numero}</td>
                          <td className={`px-3 py-2 ${em}`}>{formatDate(c.fecha_vencimiento)}</td>
                          <td className={`px-3 py-2 ${em}`}>{formatMoney(c.monto, deuda.moneda)}</td>
                          <td className={`px-3 py-2 ${em}`}>{montoUsdCuota(deuda, c.monto)}</td>
                          <td className={`px-3 py-2 ${em}`}>{montoUsdCuota(deuda, c.saldo)}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge tone={c.estado === "pagada" ? "success" : c.vencida ? "danger" : c.estado === "parcial" ? "info" : "warning"}>
                                {c.estado_display}{c.vencida ? " · vencida" : ""}
                              </Badge>
                              {pendientePorPagar ? <span className="text-xs font-bold italic text-amber-700">Pendiente por pagar</span> : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-slate-500">Sin cuotas registradas.</p>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
