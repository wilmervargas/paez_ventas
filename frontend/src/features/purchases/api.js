import { isAxiosError } from "axios";
import { api } from "../../lib/api";
export async function listCompras(params) {
    const { data } = await api.get("/compras/", { params });
    return data;
}
export async function createCompra(payload) {
    const { data } = await api.post("/compras/", payload);
    return data;
}
export async function updateCompra(id, payload) {
    const { data } = await api.put(`/compras/${id}/`, payload);
    return data;
}
export async function recibirCompra(id) {
    const { data } = await api.post(`/compras/${id}/recibir/`, {});
    return data;
}
export async function anularCompra(id, motivo) {
    const { data } = await api.post(`/compras/${id}/anular/`, { motivo });
    return data;
}
/**
 * Tasa aplicable al documento según el par moneda/base y la fecha del documento.
 *
 * Usa el endpoint `vigente`, que respeta el arrastre por día y el cruce por
 * bolívares; nunca toma "la última tasa de cualquier moneda".
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
    }
    catch (error) {
        if (isAxiosError(error) && error.response?.status === 404) {
            return null;
        }
        throw error;
    }
}
