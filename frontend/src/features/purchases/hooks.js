import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryKeys } from "../inventory/hooks";
import { anularCompra, createCompra, getTasaVigente, listCompras, recibirCompra, updateCompra, } from "./api";
export const purchasesKeys = {
    all: ["compras"],
    list: (params) => [...purchasesKeys.all, "list", params],
    tasa: (moneda, base, fecha) => ["tasas-cambio", "vigente", moneda, base, fecha ?? "hoy"],
};
export function useCompras(params) {
    return useQuery({
        queryKey: purchasesKeys.list(params),
        queryFn: () => listCompras(params),
        placeholderData: keepPreviousData,
    });
}
export function useSaveCompra() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (args) => args.id ? updateCompra(args.id, args.payload) : createCompra(args.payload),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: purchasesKeys.all });
        },
    });
}
export function useRecibirCompra() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => recibirCompra(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: purchasesKeys.all });
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        },
    });
}
export function useAnularCompra() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (args) => anularCompra(args.id, args.motivo),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: purchasesKeys.all });
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        },
    });
}
export function useTasaVigente(moneda, base, fecha) {
    return useQuery({
        queryKey: purchasesKeys.tasa(moneda, base, fecha),
        queryFn: () => getTasaVigente(moneda, base, fecha),
        enabled: /^[A-Z]{3,4}$/.test(moneda) &&
            /^[A-Z]{3,4}$/.test(base) &&
            (!fecha || /^\d{4}-\d{2}-\d{2}$/.test(fecha)),
        staleTime: 5 * 60_000,
    });
}
