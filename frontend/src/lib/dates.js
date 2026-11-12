export function formatDate(value) {
    if (!value) {
        return "—";
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "—";
    }
    return new Intl.DateTimeFormat("es-VE", {
        dateStyle: "medium",
        timeZone: "America/Caracas",
    }).format(date);
}
export function formatDateTime(value) {
    if (!value) {
        return "—";
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "—";
    }
    return new Intl.DateTimeFormat("es-VE", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Caracas",
    }).format(date);
}
