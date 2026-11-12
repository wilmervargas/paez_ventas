import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAjuste, createCategoria, createCombo, createProducto, createUnidad, deleteCategoria, deleteCombo, deleteProducto, deleteUnidad, listCategorias, listCombos, listMovimientos, listProductos, listUnidades, updateCombo, updateProducto, } from "./api";
export const inventoryKeys = {
    all: ["inventario"],
    productos: (params) => [...inventoryKeys.all, "productos", params],
    combos: (params) => [...inventoryKeys.all, "combos", params],
    movimientos: (params) => [...inventoryKeys.all, "movimientos", params],
    categorias: ["categorias-producto"],
    unidades: ["unidades-medida"],
};
export function useProductos(params) {
    return useQuery({
        queryKey: inventoryKeys.productos(params),
        queryFn: () => listProductos(params),
        placeholderData: keepPreviousData,
    });
}
export function useSaveProducto() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (args) => {
            if (args.id) {
                return updateProducto(args.id, args.payload);
            }
            return createProducto(args.payload);
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        },
    });
}
export function useDeleteProducto() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => deleteProducto(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        },
    });
}
export function useCombos(params) {
    return useQuery({
        queryKey: inventoryKeys.combos(params),
        queryFn: () => listCombos(params),
        placeholderData: keepPreviousData,
    });
}
export function useSaveCombo() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (args) => args.id ? updateCombo(args.id, args.payload) : createCombo(args.payload),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        },
    });
}
export function useDeleteCombo() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => deleteCombo(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        },
    });
}
export function useMovimientos(params) {
    return useQuery({
        queryKey: inventoryKeys.movimientos(params),
        queryFn: () => listMovimientos(params),
        placeholderData: keepPreviousData,
    });
}
export function useAjusteInventario() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload) => createAjuste(payload),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        },
    });
}
export function useCategorias() {
    return useQuery({
        queryKey: inventoryKeys.categorias,
        queryFn: listCategorias,
        staleTime: 5 * 60_000,
    });
}
export function useUnidades() {
    return useQuery({
        queryKey: inventoryKeys.unidades,
        queryFn: listUnidades,
        staleTime: 5 * 60_000,
    });
}
export function useCreateCategoria() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (nombre) => createCategoria(nombre),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.categorias });
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        },
    });
}
export function useCreateUnidad() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload) => createUnidad(payload),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.unidades });
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        },
    });
}
export function useDeleteCategoria() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => deleteCategoria(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.categorias });
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        },
    });
}
export function useDeleteUnidad() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id) => deleteUnidad(id),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.unidades });
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
        },
    });
}
