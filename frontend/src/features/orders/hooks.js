import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { inventoryKeys } from "../inventory/hooks";
import {
  anularPedido,
  confirmarPedido,
  createPedido,
  entregarPedido,
  getTasaVigente,
  listPedidos,
  updatePedido,
} from "./api";

export const ordersKeys = {
  all: ["pedidos"],
  list: (params) => [...ordersKeys.all, "list", params],
  tasa: (moneda, base, fecha) => ["tasas-cambio", "vigente", moneda, base, fecha ?? "hoy"],
};

export function usePedidos(params) {
  return useQuery({
    queryKey: ordersKeys.list(params),
    queryFn: () => listPedidos(params),
    placeholderData: keepPreviousData,
  });
}

export function useSavePedido() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args) =>
      args.id ? updatePedido(args.id, args.payload) : createPedido(args.payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ordersKeys.all });
    },
  });
}

export function useConfirmarPedido() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => confirmarPedido(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ordersKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useEntregarPedido() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => entregarPedido(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ordersKeys.all });
    },
  });
}

export function useAnularPedido() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args) => anularPedido(args.id, args.motivo),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ordersKeys.all });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useTasaVigente(moneda, base, fecha) {
  return useQuery({
    queryKey: ordersKeys.tasa(moneda, base, fecha),
    queryFn: () => getTasaVigente(moneda, base, fecha),
    enabled:
      /^[A-Z]{3,4}$/.test(moneda) &&
      /^[A-Z]{3,4}$/.test(base) &&
      (!fecha || /^\d{4}-\d{2}-\d{2}$/.test(fecha)),
    staleTime: 5 * 60_000,
  });
}
