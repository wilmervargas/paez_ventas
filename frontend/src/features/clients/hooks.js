import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCliente, createProveedor, listClientes, listProveedores, updateCliente, updateProveedor, } from "./api";
export const clientsKeys = {
    all: ["clientes"],
    list: (params) => [...clientsKeys.all, "list", params],
    suppliers: ["proveedores"],
    suppliersList: (params) => [...clientsKeys.suppliers, "list", params],
};
export function useClientes(params) {
    return useQuery({
        queryKey: clientsKeys.list(params),
        queryFn: () => listClientes(params),
        placeholderData: keepPreviousData,
    });
}
export function useSaveCliente() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (args) => {
            if (args.id) {
                return updateCliente(args.id, args.payload);
            }
            return createCliente(args.payload);
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: clientsKeys.all });
        },
    });
}
export function useProveedores(params) {
    return useQuery({
        queryKey: clientsKeys.suppliersList(params),
        queryFn: () => listProveedores(params),
        placeholderData: keepPreviousData,
    });
}
export function useSaveProveedor() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (args) => {
            if (args.id) {
                return updateProveedor(args.id, args.payload);
            }
            return createProveedor(args.payload);
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: clientsKeys.suppliers });
        },
    });
}
