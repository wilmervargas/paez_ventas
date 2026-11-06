import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  AjusteInventarioPayload,
  ComboPayload,
  ProductoPayload,
} from "../../types/inventory";
import {
  createAjuste,
  createCategoria,
  createCombo,
  createProducto,
  createUnidad,
  listCategorias,
  listCombos,
  listMovimientos,
  listProductos,
  listUnidades,
  updateCombo,
  updateProducto,
  type CombosParams,
  type MovimientosParams,
  type ProductosParams,
} from "./api";

export const inventoryKeys = {
  all: ["inventario"] as const,
  productos: (params: ProductosParams) => [...inventoryKeys.all, "productos", params] as const,
  combos: (params: CombosParams) => [...inventoryKeys.all, "combos", params] as const,
  movimientos: (params: MovimientosParams) =>
    [...inventoryKeys.all, "movimientos", params] as const,
  categorias: ["categorias-producto"] as const,
  unidades: ["unidades-medida"] as const,
};

export function useProductos(params: ProductosParams) {
  return useQuery({
    queryKey: inventoryKeys.productos(params),
    queryFn: () => listProductos(params),
    placeholderData: keepPreviousData,
  });
}

type SaveProductoArgs =
  | { id: number; payload: Partial<ProductoPayload> }
  | { id?: undefined; payload: ProductoPayload };

export function useSaveProducto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: SaveProductoArgs) => {
      if (args.id) {
        return updateProducto(args.id, args.payload);
      }
      return createProducto(args.payload as ProductoPayload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useCombos(params: CombosParams) {
  return useQuery({
    queryKey: inventoryKeys.combos(params),
    queryFn: () => listCombos(params),
    placeholderData: keepPreviousData,
  });
}

type SaveComboArgs = { id?: number; payload: ComboPayload };

export function useSaveCombo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: SaveComboArgs) =>
      args.id ? updateCombo(args.id, args.payload) : createCombo(args.payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useMovimientos(params: MovimientosParams) {
  return useQuery({
    queryKey: inventoryKeys.movimientos(params),
    queryFn: () => listMovimientos(params),
    placeholderData: keepPreviousData,
  });
}

export function useAjusteInventario() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AjusteInventarioPayload) => createAjuste(payload),
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
    mutationFn: (nombre: string) => createCategoria(nombre),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.categorias });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}

export function useCreateUnidad() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { nombre: string; abreviatura: string }) => createUnidad(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.unidades });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
  });
}
