import { Ban, Eye, Pencil, Plus, PackageCheck, Search, Truck } from "lucide-react";
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
import { useCompany } from "../../../context/company-context";
import { formatDate } from "../../../lib/dates";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { canManagePurchases } from "../../../lib/roles";
import type { EstadoCompra } from "../../../types/purchases";
import type { Compra } from "../../../types/purchases";
import { useProveedores } from "../../clients/hooks";
import { useProductos } from "../../inventory/hooks";
import { AnularCompraModal } from "../components/AnularCompraModal";
import { CompraDetailModal } from "../components/CompraDetailModal";
import { CompraFormModal } from "../components/CompraFormModal";
import { RecibirCompraModal } from "../components/RecibirCompraModal";
import { useCompras } from "../hooks";

const PAGE_SIZE = 25;

const ESTADO_TONES: Record<EstadoCompra, "warning" | "success" | "neutral"> = {
  borrador: "warning",
  recibida: "success",
  anulada: "neutral",
};

type EstadoFiltro = "todos" | EstadoCompra;

export function ComprasPage() {
  const { user } = useAuth();
  const { company } = useCompany();
  const puedeGestionar = canManagePurchases(user?.rol);
  const monedaBase = company?.moneda_base ?? "USD";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<EstadoFiltro>("todos");
  const [proveedor, setProveedor] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const [editing, setEditing] = useState<Compra | null | undefined>(undefined);
  const [detail, setDetail] = useState<Compra | null>(null);
  const [recibiendo, setRecibiendo] = useState<Compra | null>(null);
  const [anulando, setAnulando] = useState<Compra | null>(null);

  const deferredSearch = useDeferredValue(search);
  const { data, isLoading, isError, error } = useCompras({
    page,
    page_size: PAGE_SIZE,
    search: deferredSearch.trim() || undefined,
    estado: estado === "todos" ? undefined : estado,
    proveedor: proveedor === "todos" ? undefined : Number(proveedor),
    fecha_desde: fechaDesde || undefined,
    fecha_hasta: fechaHasta || undefined,
    ordering: "-fecha",
  });

  const proveedoresQuery = useProveedores({
    page_size: 100,
    ordering: "nombre",
    activo: true,
  });
  const productosQuery = useProductos({
    page_size: 100,
    ordering: "nombre",
    activo: true,
  });

  const hayFiltros =
    Boolean(deferredSearch.trim()) ||
    estado !== "todos" ||
    proveedor !== "todos" ||
    Boolean(fechaDesde) ||
    Boolean(fechaHasta);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Truck}
        title="Compras"
        description="Registra compras a proveedores. El inventario y el costo promedio se actualizan al recibir la mercancía."
        actions={
          puedeGestionar ? (
            <Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4" />}>
              Nueva compra
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="sm:col-span-2">
            <Input
              label="Buscar"
              placeholder="Número, proveedor, RIF o notas"
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
              setEstado(event.target.value as EstadoFiltro);
              setPage(1);
            }}
          >
            <option value="todos">Todos</option>
            <option value="borrador">Borradores</option>
            <option value="recibida">Recibidas</option>
            <option value="anulada">Anuladas</option>
          </Select>
          <Select
            label="Proveedor"
            value={proveedor}
            onChange={(event) => {
              setProveedor(event.target.value);
              setPage(1);
            }}
          >
            <option value="todos">Todos</option>
            {proveedoresQuery.data?.results.map((item) => (
              <option key={item.id} value={item.id}>
                {item.codigo} · {item.nombre}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
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

        {isLoading ? (
          <PageLoader label="Cargando compras..." />
        ) : isError ? (
          <div className="p-4">
            <Alert tone="error">
              {getErrorMessage(error, "No se pudieron cargar las compras.")}
            </Alert>
          </div>
        ) : data && data.results.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-sm">
                <caption className="sr-only">Listado de compras</caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Número</th>
                    <th className="px-4 py-3 font-semibold">Proveedor</th>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Líneas</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Registró</th>
                    <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.results.map((compra) => (
                    <tr key={compra.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs font-semibold text-slate-700">
                          {compra.numero}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{compra.proveedor_nombre}</p>
                        <p className="font-mono text-xs text-slate-500">
                          {compra.proveedor_codigo}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(compra.fecha)}</td>
                      <td className="px-4 py-3 text-slate-600">{compra.lineas.length}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">
                          {formatMoney(compra.total, compra.moneda)}
                        </p>
                        {compra.moneda !== monedaBase ? (
                          <p className="text-xs text-slate-500">
                            {formatMoney(compra.total_base, monedaBase)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={ESTADO_TONES[compra.estado]}>{compra.estado_display}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {compra.creado_por ?? "Sistema"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            className="px-2 py-1.5 text-xs"
                            onClick={() => setDetail(compra)}
                            icon={<Eye className="h-3.5 w-3.5" />}
                          >
                            Ver
                          </Button>
                          {puedeGestionar && compra.puede_editar ? (
                            <Button
                              variant="ghost"
                              className="px-2 py-1.5 text-xs"
                              onClick={() => setEditing(compra)}
                              icon={<Pencil className="h-3.5 w-3.5" />}
                            >
                              Editar
                            </Button>
                          ) : null}
                          {puedeGestionar && compra.puede_recibir ? (
                            <Button
                              variant="ghost"
                              className="px-2 py-1.5 text-xs"
                              onClick={() => setRecibiendo(compra)}
                              icon={<PackageCheck className="h-3.5 w-3.5" />}
                            >
                              Recibir
                            </Button>
                          ) : null}
                          {puedeGestionar && compra.puede_anular ? (
                            <Button
                              variant="ghost"
                              className="px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                              onClick={() => setAnulando(compra)}
                              icon={<Ban className="h-3.5 w-3.5" />}
                            >
                              Anular
                            </Button>
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
            icon={hayFiltros ? Search : Truck}
            title={hayFiltros ? "Sin resultados" : "Sin compras registradas"}
            description={
              hayFiltros
                ? "No hay compras que coincidan con los filtros aplicados."
                : "Registra la primera compra para abastecer el inventario y actualizar tus costos."
            }
            action={
              puedeGestionar && !hayFiltros ? (
                <Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4" />}>
                  Registrar compra
                </Button>
              ) : null
            }
          />
        )}
      </Card>

      {editing !== undefined ? (
        <CompraFormModal
          key={editing?.id ?? "nueva"}
          compra={editing}
          proveedores={proveedoresQuery.data?.results ?? []}
          productos={productosQuery.data?.results ?? []}
          onClose={() => setEditing(undefined)}
        />
      ) : null}

      {detail ? (
        <CompraDetailModal compra={detail} onClose={() => setDetail(null)} />
      ) : null}

      {recibiendo ? (
        <RecibirCompraModal
          compra={recibiendo}
          onClose={() => {
            setRecibiendo(null);
            setDetail(null);
          }}
        />
      ) : null}

      {anulando ? (
        <AnularCompraModal
          compra={anulando}
          onClose={() => {
            setAnulando(null);
            setDetail(null);
          }}
        />
      ) : null}
    </div>
  );
}
