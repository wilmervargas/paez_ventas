import axios, { type InternalAxiosRequestConfig } from "axios";

import { tokenStore } from "./tokenStore";

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api/v1";

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  // No fijar Content-Type globalmente: Axios lo infiere para JSON y, sobre todo,
  // deja que el navegador añada el boundary cuando el cuerpo es FormData.
});

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function isAuthUrl(url?: string): boolean {
  return Boolean(url?.includes("/auth/"));
}

async function requestNewAccessToken(): Promise<string | null> {
  try {
    const { data } = await axios.post<{ access: string }>(
      `${API_BASE_URL}/auth/token/refresh/`,
      {},
      { withCredentials: true },
    );
    tokenStore.set(data.access);
    return data.access;
  } catch {
    tokenStore.set(null);
    tokenStore.notifyLogout();
    return null;
  }
}

let refreshPromise: Promise<string | null> | null = null;

function refreshOnce(): Promise<string | null> {
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

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as RetryConfig | undefined;

    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthUrl(original.url)
    ) {
      original._retry = true;
      const token = await refreshOnce();
      if (token) {
        original.headers.set("Authorization", `Bearer ${token}`);
        return api(original);
      }
    }

    return Promise.reject(error);
  },
);
