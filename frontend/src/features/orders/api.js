import { isAxiosError } from "axios";
import { api } from "../../lib/api";

function idempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function listPedidos(params) {
  const { data } = await api.get("/pedidos/", { params });
  return data;
}

export async function getPedido(id) {
  const { data } = await api.get(`/pedidos/${id}/`);
  return data;
}

export async function createPedido(payload) {
  const { data } = await api.post("/pedidos/", payload, {
    headers: { "Idempotency-Key": idempotencyKey() },
  });
  return data;
}

export async function updatePedido(id, payload) {
  const { data } = await api.put(`/pedidos/${id}/`, payload);
  return data;
}

export async function confirmarPedido(id) {
  const { data } = await api.post(`/pedidos/${id}/confirmar/`, {});
  return data;
}

export async function entregarPedido(id) {
  const { data } = await api.post(`/pedidos/${id}/entregar/`, {});
  return data;
}

export async function anularPedido(id, motivo) {
  const { data } = await api.post(`/pedidos/${id}/anular/`, { motivo });
  return data;
}

/**
 * Tasa aplicable al documento según el par moneda/base y la fecha del documento.
 */
export async function getTasaVigente(moneda, base, fecha) {
  try {
    const { data } = await api.get("/tasas-cambio/vigente/", {
      params: {
        moneda,
        base: base || undefined,
        fecha: fecha || undefined,
      },
    });
    return data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}
