const currencyFormatters = new Map();
function formatterFor(currency) {
    let formatter = currencyFormatters.get(currency);
    if (!formatter) {
        formatter = new Intl.NumberFormat("es-VE", {
            style: "currency",
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
        currencyFormatters.set(currency, formatter);
    }
    return formatter;
}
/** Formatea un monto para mostrarlo. No se usa para operar aritméticamente. */
export function formatMoney(value, currency = "USD") {
    const amount = typeof value === "string" ? Number(value) : value;
    if (!Number.isFinite(amount)) {
        return "—";
    }
    return formatterFor(currency).format(amount);
}
const simbolos = {
    VES: "Bs",
    USD: "$",
    EUR: "€",
};
/**
 * Formatea una tasa de cambio (precio de una moneda expresado en otra).
 * Admite hasta 4 decimales porque las tasas no son montos de dinero.
 */
export function formatRate(value, moneda = "VES") {
    if (value === null || value === undefined || value === "") {
        return "—";
    }
    const amount = typeof value === "string" ? Number(value) : value;
    if (!Number.isFinite(amount)) {
        return "—";
    }
    const formatted = new Intl.NumberFormat("es-VE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    }).format(amount);
    return `${simbolos[moneda] ?? moneda} ${formatted}`;
}
