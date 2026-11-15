import { formatDate, formatDateTime } from "../../lib/dates";
import { formatMoney } from "../../lib/money";

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
  if (valor === null || valor === undefined || valor === "") {
    return "—";
  }

  switch (columna.type) {
    case "money": {
      const moneda = columna.currency === "row" ? fila?.moneda || monedaBase : monedaBase;
      return formatMoney(valor, moneda);
    }
    case "qty":
      return decimal(valor, 0, 3);
    case "rate":
      return decimal(valor, 2, 6);
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
      return formatDate(valor);
    }
    case "datetime":
      return formatDateTime(valor);
    default:
      return String(valor);
  }
}
