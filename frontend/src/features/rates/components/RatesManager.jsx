import { ArrowRightLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Input } from "../../../components/ui/Input";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { Select } from "../../../components/ui/Select";
import { PageLoader, Spinner } from "../../../components/ui/Spinner";
import { useAuth } from "../../../context/auth-context";
import { formatDateTime } from "../../../lib/dates";
import { getErrorMessage } from "../../../lib/errors";
import { formatRate } from "../../../lib/money";
import { canManageRates } from "../../../lib/roles";
import { TasaFormModal } from "./TasaFormModal";
import { useDeleteTasa, useResumenTasas, useTasas } from "../hooks";

const PAGE_SIZE = 25;

const MONEDA_LABEL = {
  USD: "Dólar BCV",
  EUR: "Euro BCV",
  USDT: "USDT",
};

const FUENTE_LABEL = {
  bcv: "BCV",
  usdt: "USDT",
  manual: "Manual",
};

function fuenteTone(fuente) {
  if (fuente === "bcv") {
    return "info";
  }
  if (fuente === "usdt") {
    return "warning";
  }
  return "neutral";
}

function TarjetaResumen({ fila }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {MONEDA_LABEL[fila.moneda] ?? fila.moneda}
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {formatRate(fila.tasa)}
            <span className="ml-1 text-sm font-medium text-slate-400">por 1 {fila.moneda}</span>
          </p>
        </div>
        {fila.tasa ? (
          <Badge tone={fila.es_del_dia ? "success" : "warning"}>
            {fila.es_del_dia ? "Del día" : "Arrastrada"}
          </Badge>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {fila.tasa ? (
          <>
            <Badge tone={fuenteTone(fila.fuente)}>
              {FUENTE_LABEL[fila.fuente ?? "manual"] ?? fila.fuente}
            </Badge>
            <span>Vigente desde {formatDateTime(fila.vigente_desde)}</span>
          </>
        ) : (
          <span>Sin tasa registrada. Registra la primera para poder vender en bolívares.</span>
        )}
      </div>
    </Card>
  );
}

export function RatesManager() {
  const { user } = useAuth();
  const puedeGestionar = canManageRates(user?.rol);
  const [page, setPage] = useState(1);
  const [moneda, setMoneda] = useState("todas");
  const [fuente, setFuente] = useState("todas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [editing, setEditing] = useState(undefined);
  const [borrando, setBorrando] = useState(null);
  const resumen = useResumenTasas();
  const { data, isLoading, isError, error } = useTasas({
    page,
    page_size: PAGE_SIZE,
    moneda: "VES",
    moneda_base: moneda === "todas" ? undefined : moneda,
    fuente: fuente === "todas" ? undefined : fuente,
    desde: desde || undefined,
    hasta: hasta || undefined,
    ordering: "-vigente_desde",
  });
  const deleteTasa = useDeleteTasa();

  async function confirmarBorrado() {
    if (!borrando) {
      return;
    }
    try {
      await deleteTasa.mutateAsync(borrando.id);
      setBorrando(null);
    } catch {
      // El error se muestra dentro del diálogo.
    }
  }
  const hayFiltros = moneda !== "todas" || fuente !== "todas" || Boolean(desde) || Boolean(hasta);

  function limpiarFiltros() {
    setMoneda("todas");
    setFuente("todas");
    setDesde("");
    setHasta("");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ArrowRightLeft}
        title="Tasas de cambio"
        description="Histórico diario del dólar BCV, el euro y el USDT. La última tasa registrada del día es la que aplica a compras y pedidos en bolívares."
        actions={
          puedeGestionar ? (
            <Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4" />}>
              Registrar tasa
            </Button>
          ) : null
        }
      />

      {resumen.isError ? (
        <Alert tone="error">
          {getErrorMessage(resumen.error, "No se pudo cargar el resumen de tasas.")}
        </Alert>
      ) : resumen.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Card key={item} className="grid h-32 place-items-center p-5">
              <Spinner />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {(resumen.data?.monedas ?? []).map((fila) => (
            <TarjetaResumen key={fila.moneda} fila={fila} />
          ))}
        </div>
      )}

      <Card>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Moneda"
            value={moneda}
            onChange={(event) => {
              setMoneda(event.target.value);
              setPage(1);
            }}
          >
            <option value="todas">Todas</option>
            <option value="USD">Dólar (USD)</option>
            <option value="EUR">Euro (EUR)</option>
            <option value="USDT">USDT</option>
          </Select>

          <Select
            label="Fuente"
            value={fuente}
            onChange={(event) => {
              setFuente(event.target.value);
              setPage(1);
            }}
          >
            <option value="todas">Todas</option>
            <option value="bcv">BCV</option>
            <option value="usdt">USDT / paralelo</option>
            <option value="manual">Manual</option>
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
          <PageLoader label="Cargando tasas..." />
        ) : isError ? (
          <div className="p-4">
            <Alert tone="error">{getErrorMessage(error, "No se pudieron cargar las tasas.")}</Alert>
          </div>
        ) : data && data.results.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">Histórico de tasas de cambio</caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Vigencia</th>
                    <th className="px-4 py-3 font-semibold">Moneda</th>
                    <th className="px-4 py-3 font-semibold">Tasa</th>
                    <th className="px-4 py-3 font-semibold">Fuente</th>
                    <th className="px-4 py-3 font-semibold">Registrada</th>
                    <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.results.map((tasa) => (
                    <tr key={tasa.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 text-slate-700">
                        {formatDateTime(tasa.vigente_desde)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">
                          {MONEDA_LABEL[tasa.moneda_base] ?? tasa.moneda_base}
                        </p>
                        <p className="text-xs text-slate-500">
                          1 {tasa.moneda_base} en {tasa.moneda}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-900">
                        {formatRate(tasa.tasa, tasa.moneda)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={fuenteTone(tasa.fuente)}>
                          {FUENTE_LABEL[tasa.fuente] ?? tasa.fuente}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatDateTime(tasa.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {puedeGestionar ? (
                            <>
                              <Button
                                variant="ghost"
                                className="px-2 py-1.5 text-xs"
                                onClick={() => setEditing(tasa)}
                                icon={<Pencil className="h-3.5 w-3.5" />}
                              >
                                Corregir
                              </Button>
                              <Button
                                variant="ghost"
                                className="px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                                onClick={() => setBorrando(tasa)}
                                aria-label={`Eliminar tasa ${tasa.moneda_base} ${tasa.vigente_desde}`}
                                icon={<Trash2 className="h-3.5 w-3.5" />}
                              >
                                Eliminar
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
            <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPageChange={setPage} />
          </>
        ) : (
          <EmptyState
            icon={ArrowRightLeft}
            title={hayFiltros ? "Sin resultados" : "Sin tasas registradas"}
            description={
              hayFiltros
                ? "No hay tasas que coincidan con los filtros seleccionados."
                : "Registra la tasa del día del dólar BCV, el euro y el USDT para poder operar en bolívares."
            }
            action={
              hayFiltros ? (
                <Button variant="secondary" onClick={limpiarFiltros}>
                  Limpiar filtros
                </Button>
              ) : puedeGestionar ? (
                <Button onClick={() => setEditing(null)} icon={<Plus className="h-4 w-4" />}>
                  Registrar tasa
                </Button>
              ) : null
            }
          />
        )}
      </Card>

      {editing !== undefined ? (
        <TasaFormModal key={editing?.id ?? "nueva"} tasa={editing} onClose={() => setEditing(undefined)} />
      ) : null}

      <ConfirmDialog
        open={borrando !== null}
        title="Eliminar tasa de cambio"
        message={
          borrando
            ? `Se eliminará la tasa ${MONEDA_LABEL[borrando.moneda_base] ?? borrando.moneda_base} de ${formatRate(borrando.tasa, borrando.moneda)} con vigencia ${formatDateTime(borrando.vigente_desde)}. Los documentos ya registrados conservan su tasa congelada; esta acción no se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar tasa"
        loading={deleteTasa.isPending}
        error={
          deleteTasa.isError
            ? getErrorMessage(deleteTasa.error, "No se pudo eliminar la tasa.")
            : null
        }
        onConfirm={confirmarBorrado}
        onClose={() => setBorrando(null)}
      />
    </div>
  );
}
