export interface Empresa {
  id: number;
  razon_social: string;
  nombre_comercial: string;
  rif: string;
  representante: string;
  direccion: string;
  telefono: string;
  email: string;
  eslogan: string;
  logo: string | null;
  logo_url: string | null;
  moneda_base: string;
  iva_rate: string;
  igtf_rate: string;
  created_at: string;
  updated_at: string;
}

export interface EmpresaPayload {
  razon_social: string;
  nombre_comercial: string;
  rif: string;
  representante: string;
  direccion: string;
  telefono: string;
  email: string;
  eslogan: string;
  moneda_base: string;
  iva_rate: string;
  igtf_rate: string;
  logo?: File | null;
}

export interface TasaCambio {
  id: number;
  moneda: string;
  tasa: string;
  fuente: "bcv" | "manual";
  vigente_desde: string;
  created_at: string;
}
