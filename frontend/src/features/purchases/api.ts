import { api } from "../../lib/api";
import type { Paginated } from "../../types/api";
import type { TasaCambio } from "../../types/company";
import type { Compra, CompraPayload, ComprasParams } from "../../types/purchases";

export async function listCompras(params: ComprasParams): Promise<Paginated<Compra>> {
  const { data } = await api.get<Paginated<Compra>>("/compras/", { params });
  return data;
}

export async function createCompra(payload: CompraPayload): Promise<Compra> {
  const { data } = await api.post<Compra>("/compras/", payload);
  return data;
}

export async function updateCompra(id: number, payload: CompraPayload): Promise<Compra> {
  const { data } = await api.put<Compra>(`/compras/${id}/`, payload);
  return data;
}

export async function recibirCompra(id: number): Promise<Compra> {
  const { data } = await api.post<Compra>(`/compras/${id}/recibir/`, {});
  return data;
}

export async function anularCompra(id: number, motivo: string): Promise<Compra> {
  const { data } = await api.post<Compra>(`/compras/${id}/anular/`, { motivo });
  return data;
}

export async function getTasaVigente(moneda: string): Promise<TasaCambio | null> {
  const { data } = await api.get<Paginated<TasaCambio>>("/tasas-cambio/", {
    params: {
      moneda,
      ordering: "-vigente_desde",
      page_size: 1,
    },
  });
  return data.results[0] ?? null;
}
