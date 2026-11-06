import type { ListParams } from "./api";

export type EstadoCompra = "borrador" | "recibida" | "anulada";

export interface CompraLinea {
  id: number;
  producto: number;
  producto_sku: string;
  producto_nombre: string;
  unidad_abreviatura: string;
  cantidad: string;
  costo_unitario: string;
  subtotal: string;
}

export interface Compra {
  id: number;
  numero: string;
  proveedor: number;
  proveedor_nombre: string;
  proveedor_codigo: string;
  fecha: string;
  moneda: string;
  tasa_cambio: string;
  subtotal: string;
  iva: string;
  total: string;
  total_base: string;
  estado: EstadoCompra;
  estado_display: string;
  notas: string;
  lineas: CompraLinea[];
  creado_por: string | null;
  anulado_por: number | null;
  anulado_por_nombre: string | null;
  motivo_anulacion: string;
  fecha_anulacion: string | null;
  puede_editar: boolean;
  puede_recibir: boolean;
  puede_anular: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompraLineaPayload {
  producto: number;
  cantidad: string;
  costo_unitario: string;
}

export interface CompraPayload {
  proveedor: number;
  fecha: string;
  moneda: string;
  tasa_cambio?: string;
  notas: string;
  detalles: CompraLineaPayload[];
}

export interface ComprasParams extends ListParams {
  proveedor?: number;
  estado?: EstadoCompra;
  moneda?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
}
