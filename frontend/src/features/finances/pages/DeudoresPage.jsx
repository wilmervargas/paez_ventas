import { Eye, MessageCircle, Search, Wallet } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input } from "../../../components/ui/Input";
import { PageHeader } from "../../../components/ui/PageHeader";
import { PageLoader } from "../../../components/ui/Spinner";
import { Pagination } from "../../../components/ui/Pagination";
import { useAuth } from "../../../context/auth-context";
import { formatDate } from "../../../lib/dates";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { canManagePayments } from "../../../lib/roles";
import { MensajePruebaModal } from "../../whatsapp/components/MensajePruebaModal";
import { DeudaDetailModal } from "../components/DeudaDetailModal";
import { RegistrarPagoModal } from "../components/RegistrarPagoModal";
import { useDeudoresPendientes } from "../hooks";

const PAGE_SIZE = 25;

export function DeudoresPage() {
  const { user } = useAuth();
  const puedeCobrar = canManagePayments(user?.rol);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);
  const [pago, setPago] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const deferredSearch = useDeferredValue(search);

  const { data, isLoading, isError, error } = useDeudoresPendientes({
    page,
    page_size: PAGE_SIZE,
    search: deferredSearch.trim() || undefined,
    ordering: "fecha_vencimiento",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Wallet}
        title="Deudas y cobros"
        description="Clientes con saldo pendiente, plan de cuotas y pagos."
      />

      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr]">
          <Input
            label="Buscar"
            placeholder="Cliente, código o número de pedido"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {isLoading ? (
          <PageLoader label="Cargando deudores..." />
        ) : isError ? (
          <div className="p-4">
            <Alert tone="error">{getErrorMessage(error, "No se pudieron cargar las deudas pendientes.")}</Alert>
          </div>
        ) : data && data.results.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <caption className="sr-only">Listado de deudores pendientes</caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Cliente</th>
                    <th className="px-3 py-3 font-semibold">Pedido</th>
                    <th className="px-3 py-3 font-semibold">Saldo</th>
                    <th className="px-3 py-3 font-semibold">Cuotas</th>
                    <th className="px-3 py-3 font-semibold">Próxima cuota</th>
                    <th className="px-3 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.results.map((deuda) => {
                    const prox = deuda.proxima_cuota;
                    return (
                      <tr key={deuda.id} className="hover:bg-slate-50/70">
                        <td className="px-3 py-3">
                          <p className="font-semibold text-slate-900">{deuda.cliente_nombre}</p>
                          <p className="font-mono text-xs text-slate-500">{deuda.cliente_codigo}</p>
                          {deuda.cliente_telefono ? (
                            <p className="text-xs text-slate-500">{deuda.cliente_telefono}</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-mono text-xs font-semibold text-slate-700">{deuda.pedido_numero}</p>
                          <p className="text-xs text-slate-500">{formatDate(deuda.pedido_fecha)}</p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-slate-900">{formatMoney(deuda.saldo, deuda.moneda)}</p>
                          <p className="text-xs text-slate-500">de {formatMoney(deuda.monto_original, deuda.moneda)}</p>
                          {deuda.vencida ? <Badge tone="danger">Vencida</Badge> : <Badge tone="warning">Pendiente</Badge>}
                        </td>
                        <td className="px-3 py-3 text-slate-700">
                          <p>{deuda.cuotas_pagadas}/{deuda.cuotas_total} pagadas</p>
                          <p className="text-xs text-slate-500">
                            {deuda.cuotas_pendientes} pendientes · {deuda.cuotas_vencidas} vencidas
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          {prox ? (
                            <>
                              <p className="font-medium text-slate-800">
                                Cuota {prox.numero}: {formatMoney(prox.saldo, deuda.moneda)}
                              </p>
                              <p className="text-xs text-slate-500">Vence {formatDate(prox.fecha_vencimiento)}</p>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              className="p-2"
                              onClick={() => setDetail(deuda)}
                              title="Ver detalle"
                              icon={<Eye className="h-4 w-4" />}
                            />
                            <Button
                              variant="ghost"
                              className="p-2 text-emerald-700 hover:bg-emerald-50"
                              onClick={() => setMensaje(deuda)}
                              title="Enviar mensaje de prueba"
                              icon={<MessageCircle className="h-4 w-4" />}
                            />
                            {puedeCobrar ? (
                              <Button
                                variant="ghost"
                                className="px-2 py-1.5 text-xs"
                                onClick={() => setPago(deuda)}
                              >
                                Registrar pago
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPageChange={setPage} />
          </>
        ) : (
          <EmptyState
            icon={deferredSearch ? Search : Wallet}
            title={deferredSearch ? "Sin resultados" : "Sin deudores pendientes"}
            description={
              deferredSearch
                ? "No hay deudas que coincidan con la búsqueda."
                : "No hay cuentas por cobrar con saldo pendiente."
            }
          />
        )}
      </Card>

      {detail ? <DeudaDetailModal deudaId={detail.id} onClose={() => setDetail(null)} /> : null}
      {mensaje ? (
        <MensajePruebaModal
          open
          onClose={() => setMensaje(null)}
          initialTo={mensaje.cliente_telefono || ""}
          initialMessage={`Cliente: ${mensaje.cliente_nombre}\nPedido: ${mensaje.pedido_numero}\nMonto: ${formatMoney(mensaje.saldo, mensaje.moneda)}`}
          title={`Enviar mensaje de prueba · ${mensaje.cliente_nombre}`}
        />
      ) : null}
      {pago ? <RegistrarPagoModal deuda={pago} onClose={() => setPago(null)} /> : null}
    </div>
  );
}
