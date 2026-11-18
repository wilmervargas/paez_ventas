const currencyFormatters = new Map();
const simbolos = {
    VES: "Bs",
    USD: "$",
    EUR: "€",
    USDT: "USDT",
    AJU: "AJU",
};
function formatterFor(currency) {
    let formatter = currencyFormatters.get(currency);
    if (formatter === undefined) {
        try {
            formatter = new Intl.NumberFormat("es-VE", {
                style: "currency",
                currency,
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            });
        }
        catch {
            // Monedas no ISO (p. ej. USDT): se muestran con símbolo manual.
            formatter = null;
        }
        currencyFormatters.set(currency, formatter);
    }
    return formatter;
}
function parseAmount(value) {
    if (value === null || value === undefined || value === "") return NaN;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const s = value.trim();
        if (!s) return NaN;
        // Acepta coma decimal (VE) y punto decimal (API).
        if (s.includes(",") && s.includes(".")) {
            // último separador es decimal
            return s.lastIndexOf(",") > s.lastIndexOf(".")
                ? Number(s.replace(/\./g, "").replace(",", "."))
                : Number(s.replace(/,/g, ""));
        }
        if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
        return Number(s);
    }
    return NaN;
}

/** Formatea un monto para mostrarlo. No se usa para operar aritméticamente. */
export function formatMoney(value, currency = "USD") {
    const amount = parseAmount(value);
    if (!Number.isFinite(amount)) {
        return "—";
    }
    const formatter = formatterFor(currency);
    if (formatter) return formatter.format(amount);
    const numero = new Intl.NumberFormat("es-VE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
    return `${simbolos[currency] ?? currency} ${numero}`;
}
/**
 * Formatea una tasa de cambio (precio de una moneda expresado en otra).
 * Se muestra siempre con 2 decimales en pantalla/tablas.
 */
export function formatRate(value, moneda = "VES") {
    if (value === null || value === undefined || value === "") {
        return "—";
    }
    const amount = parseAmount(value);
    if (!Number.isFinite(amount)) {
        return "—";
    }
    const formatted = new Intl.NumberFormat("es-VE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
    return `${simbolos[moneda] ?? moneda} ${formatted}`;
}
