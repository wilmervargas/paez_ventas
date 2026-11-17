function isDateOnlyString(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateValue(value) {
    if (value instanceof Date) return value;
    if (isDateOnlyString(value)) {
        const [year, month, day] = value.split("-").map(Number);
        return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    }
    return new Date(value);
}

export function formatDate(value) {
    if (!value) {
        return "—";
    }
    const date = parseDateValue(value);
    if (Number.isNaN(date.getTime())) {
        return "—";
    }
    return new Intl.DateTimeFormat("es-VE", {
        dateStyle: "medium",
        timeZone: isDateOnlyString(value) ? "UTC" : "America/Caracas",
    }).format(date);
}

export function formatDateTime(value) {
    if (!value) {
        return "—";
    }
    const date = parseDateValue(value);
    if (Number.isNaN(date.getTime())) {
        return "—";
    }
    return new Intl.DateTimeFormat("es-VE", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: isDateOnlyString(value) ? "UTC" : "America/Caracas",
    }).format(date);
}
