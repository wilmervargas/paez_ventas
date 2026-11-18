import { formatDate, formatDateTime } from "../../lib/dates";
import { formatMoney } from "../../lib/money";

const _MONEDA_LABEL = {
  USD: "Dólar",
  VES: "Bolívar",
  EUR: "Euro",
  USDT: "USDT",
  AJU: "Ajustada",
};

function numero(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }
  const parsed = Number(String(valor).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function decimal(valor, minimo, maximo) {
  const parsed = numero(valor);
  if (parsed === null) {
    return "—";
  }
  return new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: minimo,
    maximumFractionDigits: maximo,
  }).format(parsed);
}

/** Formatea el valor de una celda según el tipo declarado por el backend. */
export function formatCelda(valor, columna, fila, monedaBase) {
  try {
    if (valor === null || valor === undefined || valor === "") {
      return "—";
    }

    const tipo = columna?.type;
    const clave = columna?.key;

    switch (tipo) {
      case "money": {
        let moneda = monedaBase;
        if (columna?.currency === "row") {
          moneda = fila?.moneda_doc || fila?.moneda_documento || fila?.moneda || monedaBase;
        } else if (columna?.currency && columna.currency !== "base") {
          moneda = columna.currency;
        }
        return formatMoney(valor, moneda);
      }
      case "qty":
        return decimal(valor, 2, 2);
      case "rate":
        return decimal(valor, 2, 2);
      case "percent":
        return `${decimal(valor, 2, 2)} %`;
      case "int":
        return decimal(valor, 0, 0);
      case "date": {
        const texto = String(valor);
        if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
          const [anio, mes, dia] = texto.split("-");
          return `${dia}/${mes}/${anio}`;
        }
        return formatDate(valor) || "—";
      }
      case "datetime":
        return formatDateTime(valor) || "—";
      default:
        if (clave === "moneda") {
          // En reportes se muestra la moneda registrada/contratada tal como está en el documento.
          return String(valor).toUpper();
        }
        return String(valor);
    }
  } catch {
    return valor == null ? "—" : String(valor);
  }
}
