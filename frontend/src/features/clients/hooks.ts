import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ClientePayload, ProveedorPayload } from "../../types/clients";
import {
  createCliente,
  createProveedor,
  listClientes,
  listProveedores,
  updateCliente,
  updateProveedor,
  type ClientesParams,
} from "./api";

export const clientsKeys = {
  all: ["clientes"] as const,
  list: (params: ClientesParams) => [...clientsKeys.all, "list", params] as const,
  suppliers: ["proveedores"] as const,
  suppliersList: (params: ClientesParams) => [...clientsKeys.suppliers, "list", params] as const,
};

export function useClientes(params: ClientesParams) {
  return useQuery({
    queryKey: clientsKeys.list(params),
    queryFn: () => listClientes(params),
    placeholderData: keepPreviousData,
  });
}

type SaveClienteArgs =
  | { id: number; payload: Partial<ClientePayload> }
  | { id?: undefined; payload: ClientePayload };

export function useSaveCliente() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: SaveClienteArgs) => {
      if (args.id) {
        return updateCliente(args.id, args.payload);
      }
      return createCliente(args.payload as ClientePayload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clientsKeys.all });
    },
  });
}

export function useProveedores(params: ClientesParams) {
  return useQuery({
    queryKey: clientsKeys.suppliersList(params),
    queryFn: () => listProveedores(params),
    placeholderData: keepPreviousData,
  });
}

type SaveProveedorArgs =
  | { id: number; payload: Partial<ProveedorPayload> }
  | { id?: undefined; payload: ProveedorPayload };

export function useSaveProveedor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: SaveProveedorArgs) => {
      if (args.id) {
        return updateProveedor(args.id, args.payload);
      }
      return createProveedor(args.payload as ProveedorPayload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: clientsKeys.suppliers });
    },
  });
}
