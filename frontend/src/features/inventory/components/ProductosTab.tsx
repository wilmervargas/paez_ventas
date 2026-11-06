import { History, Package, Pencil, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card, CardHeader } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input } from "../../../components/ui/Input";
import { Pagination } from "../../../components/ui/Pagination";
import { Select } from "../../../components/ui/Select";
import { PageLoader } from "../../../components/ui/Spinner";
import { useAuth } from "../../../context/auth-context";
import { useCompany } from "../../../context/company-context";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { formatQuantity } from "../../../lib/numbers";
import { canAdjustStock, canManageCatalog, isAdmin } from "../../../lib/roles";
import type { Producto } from "../../../types/inventory";
import { AjusteStockModal } from "./AjusteStockModal";
import { ProductoFormModal } from "./ProductoFormModal";
import { useCategorias, useProductos, useUnidades } from "../hooks";

const PAGE_SIZE = 25;

export function ProductosTab({ onVerKardex }: { onVerKardex: (productoId: number) => void }) {
  const { user } = useAuth();
  const { company } = useCompany();
  const moneda = company?.moneda_base ?? "USD";
  const gestiona = canManageCatalog(user?.rol);
  const ajusta = canAdjustStock(user?.rol);
  const verCostos = isAdmin(user?.rol);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("");
  const [estado, setEstado] = useState("activos");
  const [editing, setEditing] = useState<Producto | null | undefined>(undefined);
  const [adjusting, setAdjusting] = useState<Producto | null>(null);

  const deferredSearch = useDeferredValue(search);
  const categoriasQuery = useCategorias();
  const unidadesQuery = useUnidades();
  const { data, isLoading, isError, error } = useProductos({
    page,
    page_size: PAGE_SIZE,
    search: deferredSearch.trim() || undefined,
    categoria: categoria ? Number(categoria) : undefined,
    activo: estado === "todos" ? undefined : estado === "activos",
    ordering: "nombre",
  });

  const categorias = categoriasQuery.data?.results ?? [];
  const unidades = unidadesQuery.data?.results ?? [];

  return (
    <Card>
      <CardHeader
        title="Productos"
        description="Catálogo con precio, stock y alertas de reposición."
        action={
          gestiona ? (
            <Button
              onClick={() => setEditing(null)}
              icon={<Plus className="h-4 w-4" />}
              className="px-3 py-2 text-xs"
            >
              Nuevo producto
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
        <Input
          label="Buscar"
          placeholder="SKU o nombre"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Select
          label="Categoría"
          value={categoria}
          onChange={(event) => {
            setCategoria(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todas</option>
          {categorias.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nombre}
            </option>
          ))}
        </Select>
        <Select
          label="Estado"
          value={estado}
          onChange={(event) => {
            setEstado(event.target.value);
            setPage(1);
          }}
        >
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
          <option value="todos">Todos</option>
        </Select>
      </div>

      {isLoading ? (
        <PageLoader label="Cargando productos..." />
      ) : isError ? (
        <div className="p-4">
          <Alert tone="error">
            {getErrorMessage(error, "No se pudieron cargar los productos.")}
          </Alert>
        </div>
      ) : data && data.results.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <caption className="sr-only">Catálogo de productos</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">SKU</th>
                  <th className="px-4 py-3 font-semibold">Producto</th>
                  <th className="px-4 py-3 font-semibold">Categoría</th>
                  <th className="px-4 py-3 font-semibold">Precio</th>
                  {verCostos ? <th className="px-4 py-3 font-semibold">Costo</th> : null}
                  {verCostos ? <th className="px-4 py-3 font-semibold">Margen</th> : null}
                  <th className="px-4 py-3 font-semibold">Stock</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.results.map((producto) => (
                  <tr key={producto.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{producto.sku}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {producto.imagen_url ? (
                          <img
                            src={producto.imagen_url}
                            alt=""
                            className="h-9 w-9 rounded-lg border border-slate-200 object-contain"
                          />
                        ) : (
                          <div className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-400">
                            <Package className="h-4 w-4" />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-slate-900">{producto.nombre}</p>
                          <p className="text-xs text-slate-500">
                            {producto.unidad_nombre} ({producto.unidad_abreviatura})
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{producto.categoria_nombre}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {formatMoney(producto.precio, moneda)}
                    </td>
                    {verCostos ? (
                      <td className="px-4 py-3 text-slate-600">
                        {producto.costo ? formatMoney(producto.costo, moneda) : "—"}
                      </td>
                    ) : null}
                    {verCostos ? (
                      <td className="px-4 py-3 text-slate-600">
                        {producto.margen ? formatMoney(producto.margen, moneda) : "—"}
                      </td>
                    ) : null}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">
                          {formatQuantity(producto.stock)}
                        </span>
                        {producto.stock_bajo ? <Badge tone="warning">Bajo</Badge> : null}
                      </div>
                      <p className="text-xs text-slate-500">
                        Mín. {formatQuantity(producto.stock_minimo)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={producto.activo ? "success" : "neutral"}>
                        {producto.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {gestiona ? (
                          <Button
                            variant="ghost"
                            className="px-2 py-1.5 text-xs"
                            onClick={() => setEditing(producto)}
                            icon={<Pencil className="h-3.5 w-3.5" />}
                          >
                            Editar
                          </Button>
                        ) : null}
                        {ajusta ? (
                          <Button
                            variant="ghost"
                            className="px-2 py-1.5 text-xs"
                            onClick={() => setAdjusting(producto)}
                            icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
                          >
                            Ajustar
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          className="px-2 py-1.5 text-xs"
                          onClick={() => onVerKardex(producto.id)}
                          icon={<History className="h-3.5 w-3.5" />}
                        >
                          Kardex
                        </Button>
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
          icon={Search}
          title="Sin productos"
          description={
            deferredSearch || categoria || estado !== "activos"
              ? "No hay productos que coincidan con los filtros."
              : "El catálogo está vacío. Crea tu primer producto para empezar a operar."
          }
          action={
            gestiona && !deferredSearch && !categoria && estado === "activos" ? (
              <Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4" />}>
                Registrar producto
              </Button>
            ) : null
          }
        />
      )}

      {editing !== undefined ? (
        <ProductoFormModal
          key={editing?.id ?? "nuevo"}
          producto={editing}
          categorias={categorias}
          unidades={unidades}
          onClose={() => setEditing(undefined)}
        />
      ) : null}

      {adjusting ? (
        <AjusteStockModal producto={adjusting} onClose={() => setAdjusting(null)} />
      ) : null}
    </Card>
  );
}
