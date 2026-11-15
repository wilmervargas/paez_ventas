import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  abrirCaja,
  anularPago,
  cerrarCaja,
  enviarCobroWhatsApp,
  getCajaActual,
  getDeuda,
  getMensajeCobro,
  getWhatsAppEstado,
  listCajaSesiones,
  listDeudas,
  listDeudoresPendientes,
  listPagos,
  registrarPago,
} from "./api";

export function useDeudoresPendientes(params) {
  return useQuery({ queryKey: ["deudores-pendientes", params], queryFn: () => listDeudoresPendientes(params) });
}

export function useDeudas(params) {
  return useQuery({ queryKey: ["deudas", params], queryFn: () => listDeudas(params) });
}

export function useDeuda(id) {
  return useQuery({ queryKey: ["deuda", id], queryFn: () => getDeuda(id), enabled: !!id });
}

export function usePagos(params) {
  return useQuery({ queryKey: ["pagos", params], queryFn: () => listPagos(params) });
}

export function useRegistrarPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: registrarPago,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["deudores-pendientes"] }),
        qc.invalidateQueries({ queryKey: ["deudas"] }),
        qc.invalidateQueries({ queryKey: ["deuda"] }),
        qc.invalidateQueries({ queryKey: ["pagos"] }),
        qc.invalidateQueries({ queryKey: ["caja-actual"] }),
        qc.invalidateQueries({ queryKey: ["caja-sesiones"] }),
      ]);
    },
  });
}

export function useAnularPago() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, motivo }) => anularPago(id, motivo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deudores-pendientes"] });
      qc.invalidateQueries({ queryKey: ["deudas"] });
      qc.invalidateQueries({ queryKey: ["deuda"] });
      qc.invalidateQueries({ queryKey: ["pagos"] });
      qc.invalidateQueries({ queryKey: ["caja-actual"] });
      qc.invalidateQueries({ queryKey: ["caja-sesiones"] });
    },
  });
}

export function useMensajeCobro(deudaId) {
  return useQuery({
    queryKey: ["mensaje-cobro", deudaId],
    queryFn: () => getMensajeCobro(deudaId),
    enabled: !!deudaId,
  });
}

export function useEnviarCobroWhatsApp() {
  return useMutation({
    mutationFn: ({ id, mensaje }) => enviarCobroWhatsApp(id, mensaje),
  });
}

export function useWhatsAppEstado() {
  return useQuery({
    queryKey: ["whatsapp-estado"],
    queryFn: getWhatsAppEstado,
    retry: false,
    refetchInterval: 30000,
  });
}

export function useCajaActual() {
  return useQuery({ queryKey: ["caja-actual"], queryFn: getCajaActual });
}

export function useCajaSesiones(params) {
  return useQuery({ queryKey: ["caja-sesiones", params], queryFn: () => listCajaSesiones(params) });
}

export function useAbrirCaja() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: abrirCaja,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["caja-actual"] });
      qc.invalidateQueries({ queryKey: ["caja-sesiones"] });
    },
  });
}

export function useCerrarCaja() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => cerrarCaja(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["caja-actual"] });
      qc.invalidateQueries({ queryKey: ["caja-sesiones"] });
    },
  });
}

