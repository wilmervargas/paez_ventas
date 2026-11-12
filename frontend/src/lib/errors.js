import axios from "axios";
function extractFirstError(value) {
    if (typeof value === "string") {
        return value.trim() || null;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const message = extractFirstError(item);
            if (message) {
                return message;
            }
        }
        return null;
    }
    if (value && typeof value === "object") {
        for (const item of Object.values(value)) {
            const message = extractFirstError(item);
            if (message) {
                return message;
            }
        }
    }
    return null;
}
function getFieldErrorMessage(errors) {
    if (!errors || typeof errors !== "object") {
        return null;
    }
    for (const [field, value] of Object.entries(errors)) {
        const message = extractFirstError(value);
        if (!message) {
            continue;
        }
        if (field === "detail" || field === "non_field_errors") {
            return message;
        }
        return `${field}: ${message}`;
    }
    return null;
}
export function getErrorMessage(error, fallback = "Ocurrió un error inesperado.") {
    if (axios.isAxiosError(error)) {
        const data = error.response?.data;
        const detail = typeof data?.detail === "string" ? data.detail : "";
        const fieldMessage = getFieldErrorMessage(data?.errors);
        // El backend usa "Error de validación." como mensaje genérico; en ese caso
        // es más útil mostrar el error concreto del campo que lo causó.
        if (fieldMessage && (!detail || detail === "Error de validación.")) {
            return fieldMessage;
        }
        if (detail) {
            return detail;
        }
        if (fieldMessage) {
            return fieldMessage;
        }
        if (error.message) {
            return error.message;
        }
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}
