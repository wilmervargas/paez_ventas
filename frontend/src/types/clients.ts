export interface Cliente {
  id: number;
  codigo: string;
  nombre: string;
  rif_cedula: string;
  telefono: string;
  telefono_alt: string;
  email: string;
  direccion: string;
  limite_credito: string;
  notas: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientePayload {
  codigo?: string;
  nombre: string;
  rif_cedula: string;
  telefono: string;
  telefono_alt: string;
  email: string;
  direccion: string;
  limite_credito: string;
  notas: string;
  activo: boolean;
}

export interface Proveedor {
  id: number;
  codigo: string;
  nombre: string;
  rif: string;
  telefono: string;
  email: string;
  direccion: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProveedorPayload {
  codigo?: string;
  nombre: string;
  rif: string;
  telefono: string;
  email: string;
  direccion: string;
  activo: boolean;
}
