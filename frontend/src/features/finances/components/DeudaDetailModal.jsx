import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { PageLoader } from "../../../components/ui/Spinner";
import { Alert } from "../../../components/ui/Alert";
import { formatDate } from "../../../lib/dates";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { useDeuda } from "../hooks";

export function DeudaDetailModal({ deudaId, onClose }) {
  const { data: deuda, isLoading, isError, error } = useDeuda(deudaId);

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
            <div><p className="text-slate-500">Saldo</p><p className="font-medium">{formatMoney(deuda.saldo, deuda.moneda)}</p></div>
            <div><p className="text-slate-500">Pagado</p><p className="font-medium">{formatMoney(deuda.monto_pagado, deuda.moneda)}</p></div>
            <div><p className="text-slate-500">Estado</p><Badge tone={deuda.estado === "pagada" ? "success" : deuda.vencida ? "danger" : "warning"}>{deuda.estado_display}</Badge></div>
          </div>

          <div>
            <h4 className="mb-2 font-semibold text-slate-900">Plan de cuotas ({deuda.cuotas_total})</h4>
            {deuda.cuotas?.length ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Vence</th>
                      <th className="px-3 py-2">Monto</th>
                      <th className="px-3 py-2">Saldo</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deuda.cuotas.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2 font-medium">{c.numero}</td>
                        <td className="px-3 py-2">{formatDate(c.fecha_vencimiento)}</td>
                        <td className="px-3 py-2">{formatMoney(c.monto, deuda.moneda)}</td>
                        <td className="px-3 py-2">{formatMoney(c.saldo, deuda.moneda)}</td>
                        <td className="px-3 py-2">
                          <Badge tone={c.estado === "pagada" ? "success" : c.vencida ? "danger" : c.estado === "parcial" ? "info" : "warning"}>
                            {c.estado_display}{c.vencida ? " · vencida" : ""}
                          </Badge>
                        </td>
                      </tr>
                    ))}
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
