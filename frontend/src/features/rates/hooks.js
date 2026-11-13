import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTasa, deleteTasa, getResumenTasas, listTasas, updateTasa } from "./api";
export const ratesKeys = {
    all: ["tasas-cambio"],
    list: (params) => [...ratesKeys.all, "list", params],
    resumen: (fecha) => [...ratesKeys.all, "resumen", fecha ?? "hoy"],
};
export function useTasas(params) {
    return useQuery({
        queryKey: ratesKeys.list(params),
        queryFn: () => listTasas(params),
        placeholderData: keepPreviousData,
    });
}
export function useResumenTasas(fecha) {
    return useQuery({
        queryKey: ratesKeys.resumen(fecha),
        queryFn: () => getResumenTasas(fecha),
    });
}
export function useSaveTasa() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (args) => {
            if (args.id) {
                return updateTasa(args.id, args.payload);
            }
            return createTasa(args.payload);
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ratesKeys.all });
        },
    });
}

export function useDeleteTasa() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => deleteTasa(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ratesKeys.all });
        },
    });
}
