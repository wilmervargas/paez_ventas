import { api } from "../../lib/api";
export async function listClientes(params) {
    const { data } = await api.get("/clientes/", { params });
    return data;
}
export async function createCliente(payload) {
    const { data } = await api.post("/clientes/", payload);
    return data;
}
export async function updateCliente(id, payload) {
    const { data } = await api.patch(`/clientes/${id}/`, payload);
    return data;
}
export async function listProveedores(params) {
    const { data } = await api.get("/proveedores/", { params });
    return data;
}
export async function createProveedor(payload) {
    const { data } = await api.post("/proveedores/", payload);
    return data;
}
export async function updateProveedor(id, payload) {
    const { data } = await api.patch(`/proveedores/${id}/`, payload);
    return data;
}
