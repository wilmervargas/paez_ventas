import { api } from "../../lib/api";

/** Consulta un reporte en JSON con los filtros indicados. */
export async function getReporte(tipo, params) {
  const { data } = await api.get(`/reportes/${tipo}/`, { params });
  return data;
}

function extraerNombre(headers, tipo, formato) {
  const header =
    (typeof headers?.get === "function" ? headers.get("content-disposition") : null) ??
    headers?.["content-disposition"] ??
    headers?.["Content-Disposition"];
  if (!header) {
    return `reporte-${tipo}.${formato}`;
  }
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    return decodeURIComponent(utf8[1]);
  }
  const simple = /filename="?([^";]+)"?/i.exec(header);
  return simple?.[1] ?? `reporte-${tipo}.${formato}`;
}

/** Descarga el reporte (PDF o XLSX) y dispara la descarga en el navegador. */
export async function descargarReporte(tipo, formato, params) {
  try {
    const { data, headers } = await api.get(`/reportes/${tipo}/exportar/${formato}/`, {
      params,
      responseType: "blob",
    });
    const nombre = extraerNombre(headers, tipo, formato);
    const url = URL.createObjectURL(data);
    const link = document.createElement("a");
    link.href = url;
    link.download = nombre;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Deja que el navegador inicie la descarga antes de liberar el blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return nombre;
  } catch (error) {
    // Los errores con responseType "blob" llegan como Blob; se parsean para
    // que getErrorMessage pueda mostrar el detalle del backend.
    if (error?.response?.data instanceof Blob) {
      try {
        const texto = await error.response.data.text();
        error.response.data = JSON.parse(texto);
      } catch {
        // Se conserva el error original si el cuerpo no es JSON.
      }
    }
    throw error;
  }
}
