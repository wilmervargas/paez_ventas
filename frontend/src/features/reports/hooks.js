import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { listClientes, listProveedores } from "../clients/api";
import { listCategorias, listProductos } from "../inventory/api";
import { descargarReporte, getReporte } from "./api";

export const reportsKeys = {
  all: ["reportes"],
  reporte: (tipo, params) => [...reportsKeys.all, tipo, params],
  opciones: ["reportes", "opciones"],
};

export function useReporte(tipo, params) {
  return useQuery({
    queryKey: reportsKeys.reporte(tipo, params),
    queryFn: () => getReporte(tipo, params),
    enabled: Boolean(tipo),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useExportarReporte() {
  return useMutation({
    mutationFn: ({ tipo, formato, params }) => descargarReporte(tipo, formato, params),
  });
}

function aOpciones(data, mapper) {
  const filas = Array.isArray(data) ? data : (data?.results ?? []);
  return filas.map((item) => ({ value: String(item.id), label: mapper(item) }));
}

/**
 * Carga solo las listas que el reporte necesita para sus filtros.
 * `necesarias` es un arreglo con: clientes, proveedores, categorias, productos.
 */
export function useOpcionesReporte(necesarias) {
  const usaClientes = necesarias.includes("clientes");
  const usaProveedores = necesarias.includes("proveedores");
  const usaCategorias = necesarias.includes("categorias");
  const usaProductos = necesarias.includes("productos");

  const clientes = useQuery({
    queryKey: [...reportsKeys.opciones, "clientes"],
    queryFn: () => listClientes({ page_size: 100, ordering: "nombre", activo: true }),
    enabled: usaClientes,
    staleTime: 5 * 60_000,
  });
  const proveedores = useQuery({
    queryKey: [...reportsKeys.opciones, "proveedores"],
    queryFn: () => listProveedores({ page_size: 100, ordering: "nombre", activo: true }),
    enabled: usaProveedores,
    staleTime: 5 * 60_000,
  });
  const categorias = useQuery({
    queryKey: [...reportsKeys.opciones, "categorias"],
    queryFn: () => listCategorias(),
    enabled: usaCategorias,
    staleTime: 5 * 60_000,
  });
  const productos = useQuery({
    queryKey: [...reportsKeys.opciones, "productos"],
    queryFn: () => listProductos({ page_size: 100, ordering: "nombre", activo: true }),
    enabled: usaProductos,
    staleTime: 60_000,
  });

  return {
    clientes: aOpciones(clientes.data, (item) => item.nombre),
    proveedores: aOpciones(proveedores.data, (item) => item.nombre),
    categorias: aOpciones(categorias.data, (item) => item.nombre),
    productos: aOpciones(productos.data, (item) => `${item.sku} · ${item.nombre}`),
    cargando:
      (usaClientes && clientes.isLoading) ||
      (usaProveedores && proveedores.isLoading) ||
      (usaCategorias && categorias.isLoading) ||
      (usaProductos && productos.isLoading),
  };
}
