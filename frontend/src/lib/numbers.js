const quantityFormatter = new Intl.NumberFormat("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
function parseAmount(value) {
    if (value === null || value === undefined || value === "") return NaN;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const s = value.trim();
        if (!s) return NaN;
        if (s.includes(",") && s.includes(".")) {
            return s.lastIndexOf(",") > s.lastIndexOf(".")
                ? Number(s.replace(/\./g, "").replace(",", "."))
                : Number(s.replace(/,/g, ""));
        }
        if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
        return Number(s);
    }
    return NaN;
}

/** Formatea cantidades (stock, unidades) mostrándolas siempre con 2 decimales. */
export function formatQuantity(value) {
    const amount = parseAmount(value);
    if (!Number.isFinite(amount)) {
        return "—";
    }
    return quantityFormatter.format(amount);
}
