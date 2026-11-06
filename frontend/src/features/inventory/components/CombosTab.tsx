import { Layers, Pencil, Plus } from "lucide-react";
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
import { canManageCatalog } from "../../../lib/roles";
import type { Combo } from "../../../types/inventory";
import { ComboFormModal } from "./ComboFormModal";
import { useCombos, useProductos } from "../hooks";

const PAGE_SIZE = 25;

export function CombosTab() {
  const { user } = useAuth();
  const { company } = useCompany();
  const moneda = company?.moneda_base ?? "USD";
  const gestiona = canManageCatalog(user?.rol);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("activos");
  const [editing, setEditing] = useState<Combo | null | undefined>(undefined);

  const deferredSearch = useDeferredValue(search);
  const productosQuery = useProductos({ page_size: 100, ordering: "nombre", activo: true });
  const { data, isLoading, isError, error } = useCombos({
    page,
    page_size: PAGE_SIZE,
    search: deferredSearch.trim() || undefined,
    activo: estado === "todos" ? undefined : estado === "activos",
    ordering: "nombre",
  });

  const productos = productosQuery.data?.results ?? [];

  return (
    <Card>
      <CardHeader
        title="Combos"
        description="Productos agrupados con precio propio. La disponibilidad se calcula por componentes."
        action={
          gestiona ? (
            <Button
              onClick={() => setEditing(null)}
              icon={<Plus className="h-4 w-4" />}
              className="px-3 py-2 text-xs"
            >
              Nuevo combo
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_180px]">
        <Input
          label="Buscar"
          placeholder="SKU o nombre del combo"
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
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
          <option value="todos">Todos</option>
        </Select>
      </div>

      {isLoading ? (
        <PageLoader label="Cargando combos..." />
      ) : isError ? (
        <div className="p-4">
          <Alert tone="error">{getErrorMessage(error, "No se pudieron cargar los combos.")}</Alert>
        </div>
      ) : data && data.results.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <caption className="sr-only">Listado de combos</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">SKU</th>
                  <th className="px-4 py-3 font-semibold">Combo</th>
                  <th className="px-4 py-3 font-semibold">Componentes</th>
                  <th className="px-4 py-3 font-semibold">Precio</th>
                  <th className="px-4 py-3 font-semibold">Disponibles</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.results.map((combo) => (
                  <tr key={combo.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{combo.sku}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{combo.nombre}</td>
                    <td className="px-4 py-3">
                      <ul className="space-y-0.5 text-xs text-slate-600">
                        {combo.detalle.map((detalle) => (
                          <li key={detalle.id}>
                            {formatQuantity(detalle.cantidad)} × {detalle.producto.nombre}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {formatMoney(combo.precio, moneda)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={combo.disponibilidad > 0 ? "success" : "warning"}>
                        {combo.disponibilidad} {combo.disponibilidad === 1 ? "unidad" : "unidades"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={combo.activo ? "success" : "neutral"}>
                        {combo.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        {gestiona ? (
                          <Button
                            variant="ghost"
                            className="px-2 py-1.5 text-xs"
                            onClick={() => setEditing(combo)}
                            icon={<Pencil className="h-3.5 w-3.5" />}
                          >
                            Editar
                          </Button>
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
          icon={Layers}
          title="Sin combos"
          description={
            deferredSearch || estado !== "activos"
              ? "No hay combos que coincidan con los filtros."
              : "Arma combos con tus productos para ofrecer paquetes con precio especial."
          }
          action={
            gestiona && !deferredSearch && estado === "activos" ? (
              <Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4" />}>
                Crear combo
              </Button>
            ) : null
          }
        />
      )}

      {editing !== undefined ? (
        <ComboFormModal
          key={editing?.id ?? "nuevo"}
          combo={editing}
          productos={productos}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </Card>
  );
}
