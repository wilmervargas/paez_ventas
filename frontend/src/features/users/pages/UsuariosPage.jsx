import { KeyRound, Pencil, Plus, Search, ShieldCheck } from "lucide-react";
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
import { getErrorMessage } from "../../../lib/errors";
import { ROLE_LABELS } from "../../../lib/roles";
import { SetPasswordModal } from "../components/SetPasswordModal";
import { UserFormModal } from "../components/UserFormModal";
import { useUsers } from "../hooks";

const PAGE_SIZE = 25;

export function UsuariosPage() {
  const { user: currentUser } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(undefined);
  const [passwordUser, setPasswordUser] = useState(null);
  const deferredSearch = useDeferredValue(search);

  const { data, isLoading, isError, error } = useUsers({
    page,
    page_size: PAGE_SIZE,
    search: deferredSearch.trim() || undefined,
    ordering: "nombre",
  });

  if (!currentUser?.is_superuser) {
    return (
      <Alert tone="warning" title="Acceso restringido">
        Solo los superusuarios pueden gestionar usuarios.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShieldCheck}
        title="Usuarios"
        description="Crea usuarios, asigna roles y gestiona contraseñas. Solo disponible para superusuarios."
        actions={
          <Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4" />}>
            Nuevo usuario
          </Button>
        }
      />

      <Card>
        <div className="border-b border-slate-100 p-4">
          <Input
            label="Buscar"
            placeholder="Nombre, correo o teléfono"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {isLoading ? (
          <PageLoader label="Cargando usuarios..." />
        ) : isError ? (
          <div className="p-4">
            <Alert tone="error">{getErrorMessage(error, "No se pudieron cargar los usuarios.")}</Alert>
          </div>
        ) : data && data.results?.length ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <caption className="sr-only">Listado de usuarios</caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Usuario</th>
                    <th className="px-4 py-3 font-semibold">Rol</th>
                    <th className="px-4 py-3 font-semibold">Teléfono</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Acceso</th>
                    <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.results.map((u) => (
                    <tr key={u.id} className={u.is_active ? "hover:bg-slate-50/70" : "bg-rose-50 hover:bg-rose-100/70"}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{u.nombre}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{ROLE_LABELS[u.rol] ?? u.rol}</td>
                      <td className="px-4 py-3 text-slate-600">{u.telefono || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge tone={u.is_active ? "success" : "danger"}>
                          {u.is_active ? "Activo" : "Inactivo"}
                        </Badge>
                        {u.must_change_password ? <Badge tone="warning" className="ml-1">Debe cambiar clave</Badge> : null}
                      </td>
                      <td className="px-4 py-3">
                        {u.is_superuser ? <Badge tone="info">Superusuario</Badge> : <span className="text-slate-500">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            className="p-2"
                            onClick={() => setEditing(u)}
                            title="Editar usuario"
                            aria-label={`Editar ${u.nombre}`}
                            icon={<Pencil className="h-4 w-4" />}
                          />
                          <Button
                            variant="ghost"
                            className="p-2 text-indigo-600 hover:bg-indigo-50"
                            onClick={() => setPasswordUser(u)}
                            title="Cambiar clave"
                            aria-label={`Cambiar clave de ${u.nombre}`}
                            icon={<KeyRound className="h-4 w-4" />}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPageChange={setPage} />
          </>
        ) : (
          <EmptyState
            icon={search ? Search : ShieldCheck}
            title={search ? "Sin resultados" : "Sin usuarios"}
            description={search ? "No hay usuarios que coincidan con la búsqueda." : "Crea el primer usuario del sistema."}
            action={!search ? <Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4" />}>Nuevo usuario</Button> : null}
          />
        )}
      </Card>

      {editing !== undefined ? (
        <UserFormModal key={editing?.id ?? "nuevo"} user={editing} onClose={() => setEditing(undefined)} />
      ) : null}
      {passwordUser ? <SetPasswordModal user={passwordUser} onClose={() => setPasswordUser(null)} /> : null}
    </div>
  );
}
