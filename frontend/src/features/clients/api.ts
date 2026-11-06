import { api } from "../../lib/api";
import type { ListParams, Paginated } from "../../types/api";
import type { Cliente, ClientePayload, Proveedor, ProveedorPayload } from "../../types/clients";

export interface ClientesParams extends ListParams {
  ordering?: string;
}

export async function listClientes(params: ClientesParams): Promise<Paginated<Cliente>> {
  const { data } = await api.get<Paginated<Cliente>>("/clientes/", { params });
  return data;
}

export async function createCliente(payload: ClientePayload): Promise<Cliente> {
  const { data } = await api.post<Cliente>("/clientes/", payload);
  return data;
}

export async function updateCliente(
  id: number,
  payload: Partial<ClientePayload>,
): Promise<Cliente> {
  const { data } = await api.patch<Cliente>(`/clientes/${id}/`, payload);
  return data;
}

export async function listProveedores(params: ClientesParams): Promise<Paginated<Proveedor>> {
  const { data } = await api.get<Paginated<Proveedor>>("/proveedores/", { params });
  return data;
}

export async function createProveedor(payload: ProveedorPayload): Promise<Proveedor> {
  const { data } = await api.post<Proveedor>("/proveedores/", payload);
  return data;
}

export async function updateProveedor(
  id: number,
  payload: Partial<ProveedorPayload>,
): Promise<Proveedor> {
  const { data } = await api.patch<Proveedor>(`/proveedores/${id}/`, payload);
  return data;
}
