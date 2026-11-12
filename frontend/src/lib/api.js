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
api.interceptors.request.use((config) => {
    const token = tokenStore.get();
    if (token) {
        config.headers.set("Authorization", `Bearer ${token}`);
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
