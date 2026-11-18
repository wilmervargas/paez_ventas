import {
  Ban,
  Calculator,
  CheckCircle2,
  Eye,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input } from "../../../components/ui/Input";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { PageLoader } from "../../../components/ui/Spinner";
import { Select } from "../../../components/ui/Select";
import { useAuth } from "../../../context/auth-context";
import { formatDate } from "../../../lib/dates";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney, formatRate } from "../../../lib/money";
import {
  canCancelOrders,
  canConfirmOrders,
  canDeliverOrders,
  canManageOrders,
} from "../../../lib/roles";
import { useClientes } from "../../clients/hooks";
import { useCombos, useProductos } from "../../inventory/hooks";
import { RegistrarPagoModal } from "../../finances/components/RegistrarPagoModal";
import { AnularPedidoModal } from "../components/AnularPedidoModal";
import { ConfirmarPedidoModal } from "../components/ConfirmarPedidoModal";
import { EntregarPedidoModal } from "../components/EntregarPedidoModal";
import { PedidoDetailModal } from "../components/PedidoDetailModal";
import { PedidoFormModal } from "../components/PedidoFormModal";
import { PlanCuotasModal } from "../components/PlanCuotasModal";
import { usePedidos, usePrepararCobroContado, useTasaVigente } from "../hooks";

const PAGE_SIZE = 25;
const ESTADO_TONES = {
  borrador: "warning",
  confirmado: "info",
  entregado: "success",
  anulado: "neutral",
};

function useTipoTasaPedido(pedido) {
  const tasaDoc = Number(pedido.tasa_cambio || 0);
  const tasaBcv = Number(pedido.tasa_bcv ?? 0);
  const coincideBcv =
    pedido.moneda === "VES" &&
    Number.isFinite(tasaBcv) &&
    tasaBcv > 0 &&
    Math.abs(tasaDoc - tasaBcv) < 0.000001;
  const necesitaInferir = pedido.moneda === "VES" && !coincideBcv;
  const tasaEur = useTasaVigente("VES", "EUR", necesitaInferir ? pedido.fecha : "");
  const tasaUsdt = useTasaVigente("VES", "USDT", necesitaInferir ? pedido.fecha : "");
  const tasaAju = useTasaVigente("VES", "AJU", necesitaInferir ? pedido.fecha : "");

  if (coincideBcv) {
    return { tipo: "usd_bcv", simbolo: "$", sufijo: "USD", listo: true };
  }
  if (pedido.moneda === "VES") {
    if (tasaEur.data?.tasa && Math.abs(tasaDoc - Number(tasaEur.data.tasa)) < 0.000001) {
      return { tipo: "eur_bcv", simbolo: "€", sufijo: "EUR", listo: true };
    }
    if (tasaUsdt.data?.tasa && Math.abs(tasaDoc - Number(tasaUsdt.data.tasa)) < 0.000001) {
      return { tipo: "usdt", simbolo: "USDT", sufijo: "USDT", listo: true };
    }
    if (tasaAju.data?.tasa && Math.abs(tasaDoc - Number(tasaAju.data.tasa)) < 0.000001) {
      return { tipo: "aju", simbolo: "AJU", sufijo: "AJU", listo: true };
    }
    if (necesitaInferir && (!tasaEur.isFetched || !tasaUsdt.isFetched || !tasaAju.isFetched)) {
      return { tipo: "pendiente", simbolo: null, sufijo: null, listo: false };
    }
    return { tipo: "ajuste", simbolo: null, sufijo: null, listo: true };
  }
  return { tipo: "otra", simbolo: pedido.moneda, sufijo: pedido.moneda, listo: true };
}

function TasaVentaLabel({ pedido }) {
  const tasa = formatRate(pedido.tasa_cambio);
  const info = useTipoTasaPedido(pedido);

  if (info.tipo === "usd_bcv") return `Dólar BCV: ${tasa} por $1`;
  if (info.tipo === "eur_bcv") return `Euro BCV: ${tasa} por 1 €`;
  if (info.tipo === "usdt") return `USDT: ${tasa} por 1 USDT`;
  if (info.tipo === "aju") return `Ajustada (AJU): ${tasa} por 1 AJU`;
  if (info.tipo === "ajuste") return `Ajuste/Manual: ${tasa}`;
  if (info.tipo === "pendiente") return `Tasa aplicada: ${tasa}`;
  return `${pedido.moneda}: ${tasa}`;
}

function TotalesVenta({ pedido }) {
  const info = useTipoTasaPedido(pedido);
  const totalBs = pedido.total_ves ?? (pedido.moneda === "VES" ? pedido.total : null);
  const tasaNum = Number(pedido.tasa_cambio || 0);
  let equivalente = null;

  if (totalBs != null && tasaNum > 0) {
    const eq = Number(Number(totalBs) / tasaNum).toLocaleString("es-VE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    if (info.tipo === "usd_bcv") {
      equivalente = `$ ${eq}`;
    } else if (info.tipo === "eur_bcv") {
      equivalente = `€ ${eq}`;
    } else if (info.tipo === "usdt") {
      equivalente = `${eq} USDT`;
    } else if (info.tipo === "aju") {
      equivalente = `${eq} AJU`;
    } else if (pedido.moneda === "VES") {
      equivalente = `${eq} (tasa contratada)`;
    }
  }

  return (
    <div>
      <p className="font-semibold text-slate-900">{formatMoney(pedido.total, pedido.moneda)}</p>
      {equivalente ? <p className="text-xs text-slate-500">{equivalente}</p> : null}
    </div>
  );
}

export function PedidosPage() {
  const { user } = useAuth();
  const puedeGestionar = canManageOrders(user?.rol);
  const puedeConfirmar = canConfirmOrders(user?.rol);
  const puedeAnular = canCancelOrders(user?.rol);
  const puedeEntregar = canDeliverOrders(user?.rol);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  const [cliente, setCliente] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [editing, setEditing] = useState(undefined);
  const [detail, setDetail] = useState(null);
  const [planCuotasPedido, setPlanCuotasPedido] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [entregando, setEntregando] = useState(null);
  const [anulando, setAnulando] = useState(null);
  const [cobroContadoPedido, setCobroContadoPedido] = useState(null);
  const [cobroContadoDeuda, setCobroContadoDeuda] = useState(null);
  const [cobroError, setCobroError] = useState(null);
  const prepararCobro = usePrepararCobroContado();

  const deferredSearch = useDeferredValue(search);

  const { data, isLoading, isError, error } = usePedidos({
    page,
    page_size: PAGE_SIZE,
    search: deferredSearch.trim() || undefined,
    estado: estado === "todos" ? undefined : estado,
    cliente: cliente === "todos" ? undefined : Number(cliente),
    fecha_desde: fechaDesde || undefined,
    fecha_hasta: fechaHasta || undefined,
    ordering: "-fecha",
  });

  const clientesQuery = useClientes({
    page_size: 100,
    ordering: "nombre",
    activo: true,
  });
  const productosQuery = useProductos({
    page_size: 100,
    ordering: "nombre",
    activo: true,
  });
  const combosQuery = useCombos({
    page_size: 100,
    ordering: "nombre",
    activo: true,
  });

  const hayFiltros =
    Boolean(deferredSearch.trim()) ||
    estado !== "todos" ||
    cliente !== "todos" ||
    Boolean(fechaDesde) ||
    Boolean(fechaHasta);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShoppingCart}
        title="Pedidos"
        description="Crea pedidos de venta en borrador, confírmalos para descontar inventario y regístralos como entregados."
        actions={
          puedeGestionar ? (
            <Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4" />}>
              Nuevo pedido
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="sm:col-span-2 xl:col-span-1">
            <Input
              label="Buscar"
              placeholder="Número, cliente o notas"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            label="Estado"
            value={estado}
            onChange={(event) => {
              setEstado(event.target.value);
              setPage(1);
            }}
          >
            <option value="todos">Todos</option>
            <option value="borrador">Borradores</option>
            <option value="confirmado">Confirmados</option>
            <option value="entregado">Entregados</option>
            <option value="anulado">Anulados</option>
          </Select>
          <Select
            label="Cliente"
            value={cliente}
            onChange={(event) => {
              setCliente(event.target.value);
              setPage(1);
            }}
          >
            <option value="todos">Todos</option>
            {clientesQuery.data?.results.map((item) => (
              <option key={item.id} value={item.id}>
                {item.codigo} · {item.nombre}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3 xl:col-span-2">
            <Input
              label="Desde"
              type="date"
              value={fechaDesde}
              onChange={(event) => {
                setFechaDesde(event.target.value);
                setPage(1);
              }}
            />
            <Input
              label="Hasta"
              type="date"
              value={fechaHasta}
              onChange={(event) => {
                setFechaHasta(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        {cobroError ? (
          <div className="px-4 pt-4">
            <Alert tone="error">{cobroError}</Alert>
          </div>
        ) : null}
        {isLoading ? (
          <PageLoader label="Cargando pedidos..." />
        ) : isError ? (
          <div className="p-4">
            <Alert tone="error">
              {getErrorMessage(error, "No se pudieron cargar los pedidos.")}
            </Alert>
          </div>
        ) : data && data.results.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">Listado de pedidos</caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Número</th>
                    <th className="px-3 py-3 font-semibold">Cliente</th>
                    <th className="px-3 py-3 font-semibold">Fecha</th>
                    <th className="px-3 py-3 font-semibold">Total</th>
                    <th className="px-3 py-3 font-semibold">Estado</th>
                    <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.results.map((pedido) => (
                    <tr key={pedido.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-3">
                        <p className="font-mono text-xs font-semibold text-slate-700">
                          {pedido.numero}
                        </p>
                        {pedido.numero_referencia ? (
                          <p className="text-xs text-slate-600">Ref: {pedido.numero_referencia}</p>
                        ) : null}
                        <p className="text-xs text-slate-500">{pedido.creado_por ?? "Sistema"}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{pedido.cliente_nombre}</p>
                        <p className="font-mono text-xs text-slate-500">
                          {pedido.cliente_codigo}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <p>{formatDate(pedido.fecha)}</p>
                        <p className="text-xs text-slate-500">{pedido.tipo_pago_display}</p>
                        <p className="text-xs text-slate-500"><TasaVentaLabel pedido={pedido} /></p>
                      </td>
                      <td className="px-3 py-3">
                        <TotalesVenta pedido={pedido} />
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={ESTADO_TONES[pedido.estado]}>{pedido.estado_display}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            className="p-2"
                            onClick={() => setDetail(pedido)}
                            title="Ver detalle"
                            aria-label={`Ver detalle de ${pedido.numero}`}
                            icon={<Eye className="h-4 w-4" />}
                          />
                          {puedeGestionar && pedido.puede_editar ? (
                            <Button
                              variant="ghost"
                              className="p-2"
                              onClick={() => setEditing(pedido)}
                              title="Editar borrador"
                              aria-label={`Editar ${pedido.numero}`}
                              icon={<Pencil className="h-4 w-4" />}
                            />
                          ) : null}
                          {puedeGestionar && pedido.puede_editar && pedido.tipo_pago === "credito" ? (
                            <Button
                              variant="ghost"
                              className="p-2 text-sky-600 hover:bg-sky-50"
                              onClick={() => setPlanCuotasPedido(pedido)}
                              title="Plan de cuotas"
                              aria-label={`Plan de cuotas de ${pedido.numero}`}
                              icon={<Calculator className="h-4 w-4" />}
                            />
                          ) : null}
                          {puedeConfirmar && pedido.puede_confirmar ? (
                            <Button
                              variant="ghost"
                              className="p-2 text-emerald-600 hover:bg-emerald-50"
                              onClick={() => {
                                if (pedido.tipo_pago === "contado") {
                                  setCobroError(null);
                                  setCobroContadoPedido(pedido);
                                  prepararCobro
                                    .mutateAsync(pedido.id)
                                    .then((deuda) => setCobroContadoDeuda(deuda))
                                    .catch((err) =>
                                      setCobroError(getErrorMessage(err, "No se pudo preparar el cobro.")),
                                    );
                                } else {
                                  setConfirmando(pedido);
                                }
                              }}
                              title="Confirmar pedido"
                              aria-label={`Confirmar ${pedido.numero}`}
                              icon={<CheckCircle2 className="h-4 w-4" />}
                            />
                          ) : null}
                          {puedeEntregar && pedido.estado === "confirmado" ? (
                            <Button
                              variant="ghost"
                              className="p-2 text-indigo-600 hover:bg-indigo-50"
                              onClick={() => setEntregando(pedido)}
                              title="Marcar entregado"
                              aria-label={`Entregar ${pedido.numero}`}
                              icon={<Truck className="h-4 w-4" />}
                            />
                          ) : null}
                          {puedeAnular && pedido.puede_anular ? (
                            <Button
                              variant="ghost"
                              className="p-2 text-rose-600 hover:bg-rose-50"
                              onClick={() => setAnulando(pedido)}
                              title="Anular pedido"
                              aria-label={`Anular ${pedido.numero}`}
                              icon={<Ban className="h-4 w-4" />}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              count={data.count}
              onPageChange={setPage}
            />
          </>
        ) : (
          <EmptyState
            icon={hayFiltros ? Search : ShoppingCart}
            title={hayFiltros ? "Sin resultados" : "Sin pedidos registrados"}
            description={
              hayFiltros
                ? "No hay pedidos que coincidan con los filtros aplicados."
                : "Crea el primer pedido para comenzar a gestionar tus ventas."
            }
            action={
              puedeGestionar && !hayFiltros ? (
                <Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4" />}>
                  Crear pedido
                </Button>
              ) : null
            }
          />
        )}
      </Card>

      {editing !== undefined ? (
        <PedidoFormModal
          key={editing?.id ?? "nuevo"}
          pedido={editing}
          clientes={clientesQuery.data?.results ?? []}
          productos={productosQuery.data?.results ?? []}
          combos={combosQuery.data?.results ?? []}
          onClose={() => setEditing(undefined)}
        />
      ) : null}

      {detail ? <PedidoDetailModal pedido={detail} onClose={() => setDetail(null)} /> : null}

      {planCuotasPedido ? (
        <PlanCuotasModal
          pedido={planCuotasPedido}
          onClose={() => setPlanCuotasPedido(null)}
        />
      ) : null}

      {cobroContadoDeuda ? (
        <RegistrarPagoModal
          deuda={cobroContadoDeuda}
          onClose={() => {
            const pedido = cobroContadoPedido;
            setCobroContadoDeuda(null);
            setCobroContadoPedido(null);
            if (pedido) setConfirmando(pedido);
          }}
        />
      ) : null}

      {confirmando ? (
        <ConfirmarPedidoModal
          pedido={confirmando}
          onClose={() => {
            setConfirmando(null);
            setDetail(null);
          }}
          onConfirmed={(pedidoConfirmado) => {
            setConfirmando(null);
            setDetail(null);
            if (pedidoConfirmado?.estado === "confirmado") {
              setEntregando(pedidoConfirmado);
            }
          }}
        />
      ) : null}

      {entregando ? (
        <EntregarPedidoModal
          pedido={entregando}
          onClose={() => {
            setEntregando(null);
            setDetail(null);
          }}
        />
      ) : null}

      {anulando ? (
        <AnularPedidoModal
          pedido={anulando}
          onClose={() => {
            setAnulando(null);
            setDetail(null);
          }}
        />
      ) : null}
    </div>
  );
}
