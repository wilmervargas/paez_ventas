import { Pencil, Plus, Power, Search, Truck } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input } from "../../../components/ui/Input";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { Select } from "../../../components/ui/Select";
import { PageLoader } from "../../../components/ui/Spinner";
import { useAuth } from "../../../context/auth-context";
import { getErrorMessage } from "../../../lib/errors";
import { canManageSuppliers } from "../../../lib/roles";
import { ProveedorFormModal } from "../components/ProveedorFormModal";
import { useProveedores, useSaveProveedor } from "../hooks";
const PAGE_SIZE = 25;
export function ProveedoresPage() {
    const { user } = useAuth();
    const puedeGestionar = canManageSuppliers(user?.rol);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [estado, setEstado] = useState("todos");
    const [editing, setEditing] = useState(undefined);
    const deferredSearch = useDeferredValue(search);
    const { data, isLoading, isError, error } = useProveedores({
        page,
        page_size: PAGE_SIZE,
        search: deferredSearch.trim() || undefined,
        activo: estado === "todos" ? undefined : estado === "activo",
        ordering: "nombre",
    });
    const toggle = useSaveProveedor();
    async function toggleActivo(proveedor) {
        try {
            await toggle.mutateAsync({
                id: proveedor.id,
                payload: { activo: !proveedor.activo },
            });
        }
        catch {
            // El estado de la mutación muestra el error.
        }
    }
    return (<div className="space-y-6">
      <PageHeader icon={Truck} title="Proveedores" description="Directorio de proveedores para las compras y la recepción de mercancía." actions={puedeGestionar ? (<Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4"/>}>
              Nuevo proveedor
            </Button>) : null}/>

      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_180px]">
          <Input label="Buscar" placeholder="Código, nombre, RIF, teléfono o correo" value={search} onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
        }}/>
          <Select label="Estado" value={estado} onChange={(event) => {
            setEstado(event.target.value);
            setPage(1);
        }}>
            <option value="todos">Todos</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </Select>
        </div>

        {toggle.isError ? (<div className="px-4 pt-4">
            <Alert tone="error">
              {getErrorMessage(toggle.error, "No se pudo cambiar el estado del proveedor.")}
            </Alert>
          </div>) : null}

        {isLoading ? (<PageLoader label="Cargando proveedores..."/>) : isError ? (<div className="p-4">
            <Alert tone="error">
              {getErrorMessage(error, "No se pudieron cargar los proveedores.")}
            </Alert>
          </div>) : data && data.results.length > 0 ? (<>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">Listado de proveedores</caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Código</th>
                    <th className="px-4 py-3 font-semibold">Proveedor</th>
                    <th className="px-4 py-3 font-semibold">RIF</th>
                    <th className="px-4 py-3 font-semibold">Teléfono</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.results.map((proveedor) => (<tr key={proveedor.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {proveedor.codigo}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{proveedor.nombre}</p>
                        {proveedor.email ? (<p className="text-xs text-slate-500">{proveedor.email}</p>) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{proveedor.rif || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{proveedor.telefono || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge tone={proveedor.activo ? "success" : "neutral"}>
                          {proveedor.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {puedeGestionar ? (<>
                              <Button variant="ghost" className="px-2 py-1.5 text-xs" onClick={() => setEditing(proveedor)} icon={<Pencil className="h-3.5 w-3.5"/>}>
                                Editar
                              </Button>
                              <Button variant="ghost" className="px-2 py-1.5 text-xs" onClick={() => void toggleActivo(proveedor)} loading={toggle.isPending} icon={<Power className="h-3.5 w-3.5"/>}>
                                {proveedor.activo ? "Desactivar" : "Activar"}
                              </Button>
                            </>) : (<span className="text-xs text-slate-400">Solo lectura</span>)}
                        </div>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPageChange={setPage}/>
          </>) : (<EmptyState icon={Search} title="Sin proveedores" description={deferredSearch || estado !== "todos"
                ? "No hay proveedores que coincidan con los filtros."
                : "Registra tus proveedores para poder cargar compras al inventario."} action={puedeGestionar && !deferredSearch && estado === "todos" ? (<Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4"/>}>
                  Registrar proveedor
                </Button>) : null}/>)}
      </Card>

      {editing !== undefined ? (<ProveedorFormModal key={editing?.id ?? "nuevo"} proveedor={editing} onClose={() => setEditing(undefined)}/>) : null}
    </div>);
}
