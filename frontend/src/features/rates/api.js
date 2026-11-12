import { api } from "../../lib/api";
export async function listTasas(params) {
    const { data } = await api.get("/tasas-cambio/", { params });
    return data;
}
export async function createTasa(payload) {
    const { data } = await api.post("/tasas-cambio/", payload);
    return data;
}
export async function updateTasa(id, payload) {
    const { data } = await api.patch(`/tasas-cambio/${id}/`, payload);
    return data;
}
export async function getResumenTasas(fecha) {
    const { data } = await api.get("/tasas-cambio/resumen/", {
        params: fecha ? { fecha } : undefined,
    });
    return data;
}
