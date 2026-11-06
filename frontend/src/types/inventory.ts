export interface CategoriaProducto {
  id: number;
  nombre: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface UnidadMedida {
  id: number;
  nombre: string;
  abreviatura: string;
  created_at: string;
  updated_at: string;
}

export interface Producto {
  id: number;
  sku: string;
  nombre: string;
  categoria: number;
  categoria_nombre: string;
  unidad: number;
  unidad_nombre: string;
  unidad_abreviatura: string;
  costo?: string;
  precio: string;
  margen?: string | null;
  stock: string;
  stock_minimo: string;
  stock_bajo: boolean;
  iva_aplicable: boolean;
  activo: boolean;
  imagen: string | null;
  imagen_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductoPayload {
  sku: string;
  nombre: string;
  categoria: number;
  unidad: number;
  costo: string;
  precio: string;
  stock_minimo: string;
  stock_inicial?: string;
  iva_aplicable: boolean;
  activo: boolean;
  imagen?: File | null;
}

export interface ComboComponente {
  id: number;
  producto: {
    id: number;
    sku: string;
    nombre: string;
    precio: string;
    stock: string;
    unidad_abreviatura: string;
  };
  cantidad: string;
}

export interface Combo {
  id: number;
  sku: string;
  nombre: string;
  precio: string;
  activo: boolean;
  detalle: ComboComponente[];
  disponibilidad: number;
  created_at: string;
  updated_at: string;
}

export interface ComboComponentePayload {
  producto: number;
  cantidad: string;
}

export interface ComboPayload {
  sku: string;
  nombre: string;
  precio: string;
  activo: boolean;
  componentes: ComboComponentePayload[];
}

export type TipoMovimiento =
  | "entrada"
  | "salida"
  | "ajuste"
  | "venta"
  | "compra"
  | "devolucion"
  | "anulacion";

export type DireccionMovimiento = "entrada" | "salida";

export interface MovimientoInventario {
  id: number;
  producto: number;
  producto_sku: string;
  producto_nombre: string;
  tipo: TipoMovimiento;
  tipo_display: string;
  direccion: DireccionMovimiento;
  direccion_display: string;
  signo: number;
  cantidad: string;
  costo_unitario?: string;
  motivo: string;
  referencia_tipo: string;
  referencia_id: number | null;
  usuario: string | null;
  created_at: string;
}

export interface AjusteInventarioPayload {
  producto: number;
  cantidad: string;
  direccion: DireccionMovimiento;
  costo_unitario?: string;
  motivo: string;
}
