import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { PageLoader } from "../../../components/ui/Spinner";
import { Alert } from "../../../components/ui/Alert";
import { formatDate } from "../../../lib/dates";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney, formatRate } from "../../../lib/money";
import { useTasaVigente } from "../../orders/hooks";
import { useDeuda } from "../hooks";

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
  // Para VES con tasa contratada (BCV USD/EUR/USDT/AJU), inferir por tasa_bcv cuando aplique
  const tasaDoc = Number(deuda?.tasa_cambio || 0);
  const tasaBcv = Number(deuda?.tasa_bcv || 0);
  if (tasaBcv > 0 && Math.abs(tasaDoc - tasaBcv) < 0.000001) return "USD";
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

export function DeudaDetailModal({ deudaId, onClose }) {
  const { data: deuda, isLoading, isError, error } = useDeuda(deudaId);
  const tasaAjuHoy = useTasaVigente("VES", "AJU");
  const cuotaPendienteId =
    deuda?.proxima_cuota?.id ??
    deuda?.cuotas?.find((c) => Number(c.saldo || 0) > 0)?.id ??
    null;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Detalle de deuda"
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
            <div><p className="text-slate-500">Total</p><p className="font-medium">{montoEnDivisa(deuda, deuda.monto_original)}</p></div>
            <div>
              <p className="text-slate-500">Saldo</p>
              <p className={`font-medium ${Number(deuda.saldo || 0) > 0 ? "italic" : ""}`}><strong>{montoEnDivisa(deuda, deuda.saldo)}</strong></p>
            </div>
            <div><p className="text-slate-500">Pagado</p><p className="font-medium">{montoEnDivisa(deuda, deuda.monto_pagado)}</p></div>
            <div><p className="text-slate-500">Estado</p><Badge tone={deuda.estado === "pagada" ? "success" : deuda.vencida ? "danger" : "warning"}>{deuda.estado_display}</Badge></div>
            <div><p className="text-slate-500">Tasa del pedido (seleccionada)</p><p className="font-medium">{formatRate(deuda.tasa_cambio)} <span className="text-xs font-normal text-slate-500">({deuda.moneda})</span></p></div>
            <div className="rounded-lg bg-rose-50/60 p-2">
              <p className="text-rose-600">Tasa Ajustada (AJU) del día actual</p>
              <p className="font-medium text-rose-700">
                {tasaAjuHoy.data?.tasa ? `${formatRate(tasaAjuHoy.data.tasa)} por 1 AJU` : tasaAjuHoy.isLoading ? "Cargando..." : "No disponible"}
              </p>
            </div>
          </div>

          <div>
            <h4 className="mb-2 font-semibold text-slate-900">Plan de cuotas ({deuda.cuotas_total})</h4>
            {deuda.cuotas?.length ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Cuota</th>
                      <th className="px-3 py-2">Fecha de cobro</th>
                      <th className="px-3 py-2">Monto</th>
                      <th className="px-3 py-2">Saldo</th>
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
                          <td className={`px-3 py-2 ${em}`}>{montoEnDivisa(deuda, c.monto)}</td>
                          <td className={`px-3 py-2 ${em}`}>{montoEnDivisa(deuda, c.saldo)}</td>
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
