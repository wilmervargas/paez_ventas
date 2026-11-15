import { History, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card, CardHeader } from "../../../components/ui/Card";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
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
import { AjusteStockModal } from "./AjusteStockModal";
import { ProductoFormModal } from "./ProductoFormModal";
import { useCategorias, useDeleteProducto, useProductos, useUnidades } from "../hooks";
const PAGE_SIZE = 25;
export function ProductosTab({ onVerKardex }) {
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
    const [editing, setEditing] = useState(undefined);
    const [adjusting, setAdjusting] = useState(null);
    const [borrando, setBorrando] = useState(null);
    const deleteProducto = useDeleteProducto();
    async function confirmarBorrado() {
        if (!borrando) {
            return;
        }
        try {
            await deleteProducto.mutateAsync(borrando.id);
            setBorrando(null);
        }
        catch {
            // El error se muestra dentro del diálogo.
        }
    }
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
    return (<Card>
      <CardHeader title="Productos" description="Catálogo con precio, stock y alertas de reposición." action={gestiona ? (<Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4"/>} className="px-3 py-2 text-xs">
              Nuevo producto
            </Button>) : null}/>

      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
        <Input label="Buscar" placeholder="SKU o nombre" value={search} onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
        }}/>
        <Select label="Categoría" value={categoria} onChange={(event) => {
            setCategoria(event.target.value);
            setPage(1);
        }}>
          <option value="">Todas</option>
          {categorias.map((item) => (<option key={item.id} value={item.id}>
              {item.nombre}
            </option>))}
        </Select>
        <Select label="Estado" value={estado} onChange={(event) => {
            setEstado(event.target.value);
            setPage(1);
        }}>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
          <option value="todos">Todos</option>
        </Select>
      </div>

      {isLoading ? (<PageLoader label="Cargando productos..."/>) : isError ? (<div className="p-4">
          <Alert tone="error">
            {getErrorMessage(error, "No se pudieron cargar los productos.")}
          </Alert>
        </div>) : data && data.results.length > 0 ? (<>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <caption className="sr-only">Catálogo de productos</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">SKU</th>
                  <th className="min-w-[15.5rem] w-[15.5rem] px-4 py-3 font-semibold">Producto</th>
                  <th className="px-4 py-3 font-semibold">Categoría</th>
                  <th className="px-4 py-3 font-semibold">Precio</th>
                  {verCostos ? <th className="px-4 py-3 font-semibold">Costo</th> : null}
                  <th className="px-4 py-3 font-semibold">Stock</th>
                  <th className="pl-4 pr-0 py-3 font-semibold">Estado</th>
                  <th className="whitespace-nowrap pl-0 pr-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.results.map((producto) => (<tr key={producto.id} className={producto.activo ? "bg-emerald-50/60 hover:bg-emerald-100/60" : "bg-rose-50 hover:bg-rose-100/70"}>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{producto.sku}</td>
                    <td className="min-w-[15.5rem] w-[15.5rem] px-4 py-3">
                      <div>
                        <p className="text-[12px] font-semibold text-slate-900">{producto.nombre}</p>
                        <p className="text-xs text-slate-500">
                          {producto.unidad_nombre} ({producto.unidad_abreviatura})
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{producto.categoria_nombre}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {formatMoney(producto.precio, moneda)}
                    </td>
                    {verCostos ? (<td className="px-4 py-3 text-slate-600">
                        {producto.costo ? formatMoney(producto.costo, moneda) : "—"}
                      </td>) : null}
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
                    <td className="py-3 pl-4 pr-0">
                      <Badge tone={producto.activo ? "success" : "danger"} className="-mr-3 px-2 py-0.5">
                        {producto.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap py-3 pl-0 pr-4">
                      <div className="-ml-3 flex items-center justify-end gap-0">
                        {ajusta ? (<Button variant="ghost" className="-mr-3 px-0 py-1 text-xs" onClick={() => setAdjusting(producto)} icon={<SlidersHorizontal className="h-3.5 w-3.5"/>}>
                            Ajustar
                          </Button>) : null}
                        <Button variant="ghost" className="px-0 py-1 text-xs" onClick={() => onVerKardex(producto.id)} icon={<History className="h-3.5 w-3.5"/>}>
                          Kardex
                        </Button>
                        {gestiona ? (<Button variant="ghost" className="p-0" onClick={() => setEditing(producto)} title="Editar" aria-label={`Editar producto ${producto.nombre}`} icon={<Pencil className="h-4 w-4"/>} />) : null}
                        {gestiona ? (<Button variant="ghost" className="-ml-5 p-0 text-rose-600 hover:bg-rose-50" onClick={() => setBorrando(producto)} title="Eliminar" aria-label={`Eliminar producto ${producto.nombre}`} icon={<Trash2 className="h-4 w-4"/>} />) : null}
                      </div>
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPageChange={setPage}/>
        </>) : (<EmptyState icon={Search} title="Sin productos" description={deferredSearch || categoria || estado !== "activos"
                ? "No hay productos que coincidan con los filtros."
                : "El catálogo está vacío. Crea tu primer producto para empezar a operar."} action={gestiona && !deferredSearch && !categoria && estado === "activos" ? (<Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4"/>}>
                Registrar producto
              </Button>) : null}/>)}

      {editing !== undefined ? (<ProductoFormModal key={editing?.id ?? "nuevo"} producto={editing} categorias={categorias} unidades={unidades} onClose={() => setEditing(undefined)}/>) : null}

      {adjusting ? (<AjusteStockModal producto={adjusting} onClose={() => setAdjusting(null)}/>) : null}

      <ConfirmDialog open={borrando !== null} title="Eliminar producto" message={borrando
            ? `Se eliminará "${borrando.nombre}" (${borrando.sku}) de forma permanente. Solo es posible si el producto no tiene kardex, compras ni combos asociados.`
            : ""} confirmLabel="Eliminar producto" loading={deleteProducto.isPending} error={deleteProducto.isError
            ? getErrorMessage(deleteProducto.error, "No se pudo eliminar el producto.")
            : null} onConfirm={confirmarBorrado} onClose={() => setBorrando(null)}/>
    </Card>);
}
