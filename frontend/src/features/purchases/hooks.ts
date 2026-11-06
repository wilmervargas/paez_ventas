import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { inventoryKeys } from "../inventory/hooks";
import type { CompraPayload, ComprasParams } from "../../types/purchases";
import {
  anularCompra,
  createCompra,
  getTasaVigente,
  listCompras,
  recibirCompra,
  updateCompra,
} from "./api";

export const purchasesKeys = {
  all: ["compras"] as const,
  list: (params: ComprasParams) => [...purchasesKeys.all, "list", params] as const,
  tasa: (moneda: string) => ["tasas-cambio", "vigente", moneda] as const,
};

export function useCompras(params: ComprasParams) {
  return useQuery({
    queryKey: purchasesKeys.list(params),
    queryFn: () => listCompras(params),
    placeholderData: keepPreviousData,
  });
}

type SaveCompraArgs = { id?: number; payload: CompraPayload };

export function useSaveCompra() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: SaveCompraArgs) =>
      args.id ? updateCompra(args.id, args.payload) : createCompra(args.payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: purchasesKeys.all });
    },
  });
}

export function useRecibirCompra() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => recibirCompra(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: purchasesKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useAnularCompra() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { id: number; motivo: string }) =>
      anularCompra(args.id, args.motivo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: purchasesKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useTasaVigente(moneda: string) {
  return useQuery({
    queryKey: purchasesKeys.tasa(moneda),
    queryFn: () => getTasaVigente(moneda),
    enabled: /^[A-Z]{3}$/.test(moneda),
    staleTime: 5 * 60_000,
  });
}
