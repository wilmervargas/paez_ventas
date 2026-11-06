import { Pencil, Plus, Power, Search, Users } from "lucide-react";
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
import { Select } from "../../../components/ui/Select";
import { useAuth } from "../../../context/auth-context";
import { useCompany } from "../../../context/company-context";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { canManageClients } from "../../../lib/roles";
import type { Cliente } from "../../../types/clients";
import { ClienteFormModal } from "../components/ClienteFormModal";
import { useClientes, useSaveCliente } from "../hooks";

const PAGE_SIZE = 25;

export function ClientesPage() {
  const { user } = useAuth();
  const { company } = useCompany();
  const moneda = company?.moneda_base ?? "USD";
  const puedeGestionar = canManageClients(user?.rol);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("todos");
  const [editing, setEditing] = useState<Cliente | null | undefined>(undefined);

  const deferredSearch = useDeferredValue(search);
  const { data, isLoading, isError, error } = useClientes({
    page,
    page_size: PAGE_SIZE,
    search: deferredSearch.trim() || undefined,
    activo: estado === "todos" ? undefined : estado === "activo",
    ordering: "nombre",
  });
  const toggle = useSaveCliente();

  async function toggleActivo(cliente: Cliente) {
    try {
      await toggle.mutateAsync({
        id: cliente.id,
        payload: { activo: !cliente.activo },
      });
    } catch {
      // El error se refleja en el estado de la mutación; se evita duplicar alertas.
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Clientes"
        description="Directorio de clientes con datos de contacto, límite de crédito y estado."
        actions={
          puedeGestionar ? (
            <Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4" />}>
              Nuevo cliente
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_180px]">
          <Input
            label="Buscar"
            placeholder="Código, nombre, RIF, teléfono o correo"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <Select
            label="Estado"
            value={estado}
            onChange={(event) => {
              setEstado(event.target.value);
              setPage(1);
            }}
          >
            <option value="todos">Todos</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </Select>
        </div>

        {toggle.isError ? (
          <div className="px-4 pt-4">
            <Alert tone="error">
              {getErrorMessage(toggle.error, "No se pudo cambiar el estado del cliente.")}
            </Alert>
          </div>
        ) : null}

        {isLoading ? (
          <PageLoader label="Cargando clientes..." />
        ) : isError ? (
          <div className="p-4">
            <Alert tone="error">{getErrorMessage(error, "No se pudieron cargar los clientes.")}</Alert>
          </div>
        ) : data && data.results.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <caption className="sr-only">Listado de clientes</caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Código</th>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">RIF / cédula</th>
                    <th className="px-4 py-3 font-semibold">Teléfono</th>
                    <th className="px-4 py-3 font-semibold">Límite</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.results.map((cliente) => (
                    <tr key={cliente.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {cliente.codigo}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{cliente.nombre}</p>
                        {cliente.email ? (
                          <p className="text-xs text-slate-500">{cliente.email}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{cliente.rif_cedula || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{cliente.telefono || "—"}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {formatMoney(cliente.limite_credito, moneda)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={cliente.activo ? "success" : "neutral"}>
                          {cliente.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {puedeGestionar ? (
                            <>
                              <Button
                                variant="ghost"
                                className="px-2 py-1.5 text-xs"
                                onClick={() => setEditing(cliente)}
                                icon={<Pencil className="h-3.5 w-3.5" />}
                              >
                                Editar
                              </Button>
                              <Button
                                variant="ghost"
                                className="px-2 py-1.5 text-xs"
                                onClick={() => void toggleActivo(cliente)}
                                loading={toggle.isPending}
                                icon={<Power className="h-3.5 w-3.5" />}
                              >
                                {cliente.activo ? "Desactivar" : "Activar"}
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">Solo lectura</span>
                          )}
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
            title="Sin clientes"
            description={
              deferredSearch || estado !== "todos"
                ? "No hay clientes que coincidan con los filtros."
                : "Aún no hay clientes registrados. Crea el primero para empezar a vender."
            }
            action={
              puedeGestionar && !deferredSearch && estado === "todos" ? (
                <Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4" />}>
                  Registrar cliente
                </Button>
              ) : null
            }
          />
        )}
      </Card>

      {editing !== undefined ? (
        <ClienteFormModal
          key={editing?.id ?? "nuevo"}
          cliente={editing}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </div>
  );
}

