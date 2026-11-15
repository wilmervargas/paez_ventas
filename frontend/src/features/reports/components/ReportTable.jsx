import { Badge } from "../../../components/ui/Badge";
import { formatCelda } from "../format";

const TONOS = {
  confirmado: "success",
  entregado: "success",
  recibida: "success",
  pagada: "success",
  aplicado: "success",
  ok: "success",
  entrada: "success",
  abierta: "info",
  abierto: "info",
  borrador: "warning",
  pendiente: "warning",
  salida: "warning",
  bajo: "danger",
  anulado: "neutral",
  anulada: "neutral",
  cerrada: "neutral",
  cerrado: "neutral",
};

const CLAVES_LARGAS = new Set([
  "cliente",
  "producto",
  "descripcion",
  "motivo",
  "proveedor",
  "referencia",
]);

function celda(columna, fila, monedaBase) {
  const valor = fila[columna.key];
  if (columna.type === "badge") {
    if (valor === null || valor === undefined || valor === "") {
      return "—";
    }
    return <Badge tone={TONOS[String(valor).toLowerCase()] ?? "neutral"}>{valor}</Badge>;
  }
  return formatCelda(valor, columna, fila, monedaBase);
}

export function ReportTable({ reporte, filas: filasProp }) {
  const columnas = reporte.columnas ?? [];
  const filas = filasProp ?? reporte.filas ?? [];
  const totales = reporte.fila_totales ?? {};
  const hayTotales = Object.keys(totales).length > 0;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <caption className="sr-only">{reporte.titulo}</caption>
        <thead className="bg-slate-50">
          <tr>
            {columnas.map((columna) => (
              <th
                key={columna.key}
                scope="col"
                className={
                  "whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 " +
                  (columna.align === "right"
                    ? "text-right"
                    : columna.align === "center"
                      ? "text-center"
                      : "text-left")
                }
              >
                {columna.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((fila, indice) => (
            <tr key={indice} className="transition hover:bg-slate-50">
              {columnas.map((columna) => {
                const contenido = celda(columna, fila, reporte.moneda_base);
                const esLarga = CLAVES_LARGAS.has(columna.key);
                return (
                  <td
                    key={columna.key}
                    title={esLarga && typeof contenido === "string" ? contenido : undefined}
                    className={
                      "px-3 py-2.5 text-slate-700 " +
                      (columna.align === "right"
                        ? "whitespace-nowrap text-right tabular-nums"
                        : columna.align === "center"
                          ? "whitespace-nowrap text-center"
                          : esLarga
                            ? "max-w-[18rem] truncate"
                            : "whitespace-nowrap")
                    }
                  >
                    {contenido}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {hayTotales ? (
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold text-slate-900">
              {columnas.map((columna, indice) => {
                const valor = totales[columna.key];
                return (
                  <td
                    key={columna.key}
                    className={
                      "px-3 py-2.5 " +
                      (columna.align === "right"
                        ? "whitespace-nowrap text-right tabular-nums"
                        : "whitespace-nowrap")
                    }
                  >
                    {indice === 0 && valor === undefined
                      ? "Totales"
                      : valor !== undefined
                        ? formatCelda(valor, columna, {}, reporte.moneda_base)
                        : ""}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
