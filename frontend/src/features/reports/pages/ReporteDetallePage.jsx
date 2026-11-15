import {
  ArrowLeft,
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { PageLoader } from "../../../components/ui/Spinner";
import { useAuth } from "../../../context/auth-context";
import { formatDateTime } from "../../../lib/dates";
import { getErrorMessage } from "../../../lib/errors";
import { REPORTES_POR_TIPO, puedeVerReporte } from "../config";
import { ReportFilters } from "../components/ReportFilters";
import { ReportTable } from "../components/ReportTable";
import { formatCelda } from "../format";
import { useExportarReporte, useOpcionesReporte, useReporte } from "../hooks";

const PAGE_SIZE = 50;

function construirParams(filtros) {
  const params = {};
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor === "" || valor === false || valor === null || valor === undefined) {
      continue;
    }
    params[clave] = valor === true ? "true" : valor;
  }
  return params;
}

export function ReporteDetallePage({ tipo }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const config = REPORTES_POR_TIPO[tipo];
  const permitido = Boolean(config && puedeVerReporte(user?.rol, tipo));

  const [filtros, setFiltros] = useState({});
  const [page, setPage] = useState(1);
  const [formatoActivo, setFormatoActivo] = useState(null);
  const [exportError, setExportError] = useState(null);

  const necesarias = useMemo(
    () =>
      permitido
        ? [...new Set((config?.filtros ?? []).map((filtro) => filtro.optionsKey).filter(Boolean))]
        : [],
    [config, permitido],
  );
  const opciones = useOpcionesReporte(necesarias);
  const params = useMemo(() => construirParams(filtros), [filtros]);
  const { data, isLoading, isFetching, isError, error } = useReporte(
    permitido ? tipo : null,
    params,
  );
  const exportar = useExportarReporte();

  if (!config) {
    return (
      <Card>
        <EmptyState
          icon={BarChart3}
          title="Reporte no encontrado"
          description="El reporte solicitado no existe."
          action={
            <Link to="/app/reportes">
              <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
                Volver a reportes
              </Button>
            </Link>
          }
        />
      </Card>
    );
  }

  if (!puedeVerReporte(user?.rol, tipo)) {
    return (
      <div className="space-y-4">
        <PageHeader icon={config.icon} title={config.titulo} description={config.descripcion} />
        <Alert tone="error" title="Sin permisos">
          Tu rol no tiene acceso a este reporte.{" "}
          <Link className="font-semibold underline" to="/app/reportes">
            Volver a reportes
          </Link>
        </Alert>
      </div>
    );
  }

  const filas = data?.filas ?? [];
  const totalPaginas = Math.max(1, Math.ceil(filas.length / PAGE_SIZE));
  const paginaActual = Math.min(page, totalPaginas);
  const visibles = filas.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE);
  const exportando = exportar.isPending;

  function aplicarFiltros(siguientes) {
    setFiltros(siguientes);
    setPage(1);
  }

  function limpiarFiltros() {
    setFiltros({});
    setPage(1);
  }

  async function descargar(formato) {
    setExportError(null);
    setFormatoActivo(formato);
    try {
      await exportar.mutateAsync({ tipo, formato, params });
    } catch (err) {
      setExportError(getErrorMessage(err, "No se pudo generar la exportación."));
    } finally {
      setFormatoActivo(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={config.icon}
        title={data?.titulo ?? config.titulo}
        description={data?.descripcion ?? config.descripcion}
        actions={
          <>
            <Button
              variant="ghost"
              icon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => navigate("/app/reportes")}
            >
              Reportes
            </Button>
            <Button
              variant="secondary"
              icon={<FileText className="h-4 w-4" />}
              loading={formatoActivo === "pdf"}
              disabled={!data || (exportando && formatoActivo !== "pdf")}
              onClick={() => descargar("pdf")}
            >
              PDF
            </Button>
            <Button
              variant="secondary"
              icon={<FileSpreadsheet className="h-4 w-4" />}
              loading={formatoActivo === "xlsx"}
              disabled={!data || (exportando && formatoActivo !== "xlsx")}
              onClick={() => descargar("xlsx")}
            >
              Excel
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader
          title="Filtros"
          description="Ajusta el período y los criterios. Los totales se consolidan en la moneda base de la empresa."
          action={
            isFetching && !isLoading ? (
              <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Actualizando...
              </span>
            ) : null
          }
        />
        <CardBody>
          <ReportFilters
            key={tipo}
            reporte={config}
            opciones={opciones}
            onApply={aplicarFiltros}
            onReset={limpiarFiltros}
            cargando={isFetching}
          />
        </CardBody>
      </Card>

      {exportError ? (
        <Alert tone="error" title="No se pudo exportar">
          {exportError}
        </Alert>
      ) : null}

      {isError ? (
        <Alert tone="error" title="No se pudo cargar el reporte">
          {getErrorMessage(error)}
        </Alert>
      ) : null}

      {isLoading ? (
        <Card>
          <PageLoader label="Generando reporte..." />
        </Card>
      ) : null}

      {data ? (
        <>
          {data.truncado ? (
            <Alert tone="warning" title="Reporte truncado">
              Se muestran los primeros {data.filas.length} de {data.total_filas} registros. Ajusta los
              filtros o exporta para conservar el detalle disponible.
            </Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.resumen.map((item) => (
              <Card key={item.label}>
                <div className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-1 text-lg font-bold text-slate-900">
                    {formatCelda(
                      item.value,
                      { type: item.type, currency: item.currency },
                      {},
                      data.moneda_base,
                    )}
                  </p>
                </div>
              </Card>
            ))}
          </div>

          {data.filtros_aplicados.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold uppercase tracking-wide">Filtros aplicados:</span>
              {data.filtros_aplicados.map((item, indice) => (
                <span
                  key={`${item.label}-${indice}`}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600"
                >
                  <span className="font-medium text-slate-700">{item.label}:</span>
                  {item.value}
                </span>
              ))}
            </div>
          ) : null}

          <Card>
            <CardHeader
              title={`Detalle (${data.total_filas} ${data.total_filas === 1 ? "registro" : "registros"})`}
              description={`Moneda base: ${data.moneda_base} · Generado: ${formatDateTime(data.generado_en)}`}
              action={
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                  <Download className="h-3.5 w-3.5" />
                  PDF y Excel con los filtros aplicados
                </span>
              }
            />
            {filas.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="Sin resultados"
                description="No hay registros que coincidan con los filtros seleccionados."
                action={
                  <Button variant="secondary" onClick={limpiarFiltros}>
                    Limpiar filtros
                  </Button>
                }
              />
            ) : (
              <>
                <ReportTable reporte={data} filas={visibles} />
                {filas.length > PAGE_SIZE ? (
                  <Pagination
                    page={paginaActual}
                    pageSize={PAGE_SIZE}
                    count={filas.length}
                    onPageChange={setPage}
                  />
                ) : null}
              </>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}

/** Envuelve la página para remontarla al cambiar de reporte y limpiar filtros. */
export function ReporteDetalleRoute() {
  const { tipo } = useParams();
  return <ReporteDetallePage key={tipo} tipo={tipo} />;
}
