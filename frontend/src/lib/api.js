import axios from "axios";
import { tokenStore } from "./tokenStore";
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api/v1";
export const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    // No fijar Content-Type globalmente: Axios lo infiere para JSON y, sobre todo,
    // deja que el navegador añada el boundary cuando el cuerpo es FormData.
});
function isAuthUrl(url) {
    return Boolean(url?.includes("/auth/"));
}
async function requestNewAccessToken() {
    try {
        const { data } = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {}, { withCredentials: true });
        tokenStore.set(data.access);
        return data.access;
    }
    catch {
        tokenStore.set(null);
        tokenStore.notifyLogout();
        return null;
    }
}
let refreshPromise = null;
function refreshOnce() {
    if (!refreshPromise) {
        refreshPromise = requestNewAccessToken().finally(() => {
            refreshPromise = null;
        });
    }
    return refreshPromise;
}
function normalizeDecimalCommas(value) {
    if (Array.isArray(value)) return value.map(normalizeDecimalCommas);
    if (value && typeof value === "object" && !(value instanceof FormData) && !(value instanceof Blob)) {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = normalizeDecimalCommas(v);
        return out;
    }
    if (typeof value === "string") {
        const s = value.trim();
        // Convierte formatos VE a punto decimal para la API.
        // "123,45" -> "123.45"; "1.234,56" -> "1234.56"
        if (/^-?\d{1,3}(?:\.\d{3})*,\d+$/.test(s)) {
            return s.replace(/\./g, "").replace(",", ".");
        }
        if (/^-?\d+,\d+$/.test(s)) return s.replace(",", ".");
    }
    return value;
}

api.interceptors.request.use((config) => {
    const token = tokenStore.get();
    if (token) {
        config.headers.set("Authorization", `Bearer ${token}`);
    }
    if (config.data && typeof config.data === "object") {
        config.data = normalizeDecimalCommas(config.data);
    }
    return config;
});
api.interceptors.response.use((response) => response, async (error) => {
    const original = error.config;
    if (error.response?.status === 401 &&
        original &&
        !original._retry &&
        !isAuthUrl(original.url)) {
        original._retry = true;
        const token = await refreshOnce();
        if (token) {
            original.headers.set("Authorization", `Bearer ${token}`);
            return api(original);
        }
    }
    return Promise.reject(error);
});
