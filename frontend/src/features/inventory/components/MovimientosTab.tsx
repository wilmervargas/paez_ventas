import { History } from "lucide-react";
import { useDeferredValue, useState } from "react";

import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Card, CardHeader } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input } from "../../../components/ui/Input";
import { Pagination } from "../../../components/ui/Pagination";
import { Select } from "../../../components/ui/Select";
import { PageLoader } from "../../../components/ui/Spinner";
import { useAuth } from "../../../context/auth-context";
import { useCompany } from "../../../context/company-context";
import { formatDateTime } from "../../../lib/dates";
import { getErrorMessage } from "../../../lib/errors";
import { formatMoney } from "../../../lib/money";
import { formatQuantity } from "../../../lib/numbers";
import { isAdmin } from "../../../lib/roles";
import type { TipoMovimiento } from "../../../types/inventory";
import { useMovimientos, useProductos } from "../hooks";

const PAGE_SIZE = 25;

const TIPOS: { value: TipoMovimiento; label: string }[] = [
  { value: "entrada", label: "Entrada" },
  { value: "salida", label: "Salida" },
  { value: "ajuste", label: "Ajuste" },
  { value: "venta", label: "Venta" },
  { value: "compra", label: "Compra" },
  { value: "devolucion", label: "Devolución" },
  { value: "anulacion", label: "Anulación" },
];

export function MovimientosTab({ productoInicial }: { productoInicial?: number }) {
  const { user } = useAuth();
  const { company } = useCompany();
  const moneda = company?.moneda_base ?? "USD";
  const verCostos = isAdmin(user?.rol);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [producto, setProducto] = useState(productoInicial ? String(productoInicial) : "");
  const [tipo, setTipo] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const deferredSearch = useDeferredValue(search);
  const productosQuery = useProductos({ page_size: 100, ordering: "nombre", activo: true });
  const { data, isLoading, isError, error } = useMovimientos({
    page,
    page_size: PAGE_SIZE,
    search: deferredSearch.trim() || undefined,
    producto: producto ? Number(producto) : undefined,
    tipo: (tipo || undefined) as TipoMovimiento | undefined,
    fecha_desde: desde || undefined,
    fecha_hasta: hasta || undefined,
    ordering: "-created_at",
  });

  return (
    <Card>
      <CardHeader
        title="Kardex de inventario"
        description="Registro inmutable de entradas, salidas, ventas, compras y ajustes."
      />

      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <Input
          label="Buscar"
          placeholder="Producto, motivo o referencia"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <Select
          label="Producto"
          value={producto}
          onChange={(event) => {
            setProducto(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos los productos</option>
          {(productosQuery.data?.results ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.sku} · {item.nombre}
            </option>
          ))}
        </Select>
        <Select
          label="Tipo"
          value={tipo}
          onChange={(event) => {
            setTipo(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos los tipos</option>
          {TIPOS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
        <Input
          label="Desde"
          type="date"
          value={desde}
          onChange={(event) => {
            setDesde(event.target.value);
            setPage(1);
          }}
        />
        <Input
          label="Hasta"
          type="date"
          value={hasta}
          onChange={(event) => {
            setHasta(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {isLoading ? (
        <PageLoader label="Cargando movimientos..." />
      ) : isError ? (
        <div className="p-4">
          <Alert tone="error">
            {getErrorMessage(error, "No se pudieron cargar los movimientos.")}
          </Alert>
        </div>
      ) : data && data.results.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <caption className="sr-only">Movimientos de inventario</caption>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Producto</th>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 font-semibold">Movimiento</th>
                  <th className="px-4 py-3 font-semibold">Motivo</th>
                  <th className="px-4 py-3 font-semibold">Usuario</th>
                  {verCostos ? <th className="px-4 py-3 font-semibold">Costo unit.</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.results.map((movimiento) => (
                  <tr key={movimiento.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDateTime(movimiento.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{movimiento.producto_nombre}</p>
                      <p className="font-mono text-xs text-slate-500">{movimiento.producto_sku}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={movimiento.direccion === "entrada" ? "success" : "danger"}>
                        {movimiento.tipo_display}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">
                      <span
                        className={
                          movimiento.direccion === "entrada" ? "text-emerald-700" : "text-rose-700"
                        }
                      >
                        {movimiento.direccion === "entrada" ? "+" : "−"}
                        {formatQuantity(movimiento.cantidad)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{movimiento.motivo || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{movimiento.usuario || "Sistema"}</td>
                    {verCostos ? (
                      <td className="px-4 py-3 text-slate-600">
                        {movimiento.costo_unitario
                          ? formatMoney(movimiento.costo_unitario, moneda)
                          : "—"}
                      </td>
                    ) : null}
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
          icon={History}
          title="Sin movimientos"
          description="No hay movimientos que coincidan con los filtros seleccionados."
        />
      )}
    </Card>
  );
}
