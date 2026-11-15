import { api } from "../../lib/api";

function idempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function listDeudas(params) {
  const { data } = await api.get("/deudas/", { params });
  return data;
}

export async function listDeudoresPendientes(params) {
  const { data } = await api.get("/deudas/pendientes/", { params });
  return data;
}

export async function getDeuda(id) {
  const { data } = await api.get(`/deudas/${id}/`);
  return data;
}

export async function listPagos(params) {
  const { data } = await api.get("/pagos/", { params });
  return data;
}

export async function registrarPago(payload) {
  const { data } = await api.post("/pagos/", payload, {
    headers: { "Idempotency-Key": idempotencyKey() },
  });
  return data;
}

export async function anularPago(id, motivo) {
  const { data } = await api.post(`/pagos/${id}/anular/`, { motivo });
  return data;
}

// Caja
export async function getCajaActual() {
  const { data } = await api.get("/caja/actual/");
  return data;
}

export async function listCajaSesiones(params) {
  const { data } = await api.get("/caja/sesiones/", { params });
  return data;
}

export async function abrirCaja(payload) {
  const { data } = await api.post("/caja/sesiones/abrir/", payload);
  return data;
}

export async function cerrarCaja(id, payload) {
  const { data } = await api.post(`/caja/sesiones/${id}/cerrar/`, payload);
  return data;
}

// Cobranza por WhatsApp (servidor local ws/)
export async function getMensajeCobro(deudaId) {
  const { data } = await api.get(`/deudas/${deudaId}/mensaje-cobro/`);
  return data;
}

export async function enviarCobroWhatsApp(deudaId, mensaje) {
  const { data } = await api.post(`/deudas/${deudaId}/enviar-cobro/`, { mensaje });
  return data;
}

export async function getWhatsAppEstado() {
  const { data } = await api.get("/whatsapp/estado/");
  return data;
}

