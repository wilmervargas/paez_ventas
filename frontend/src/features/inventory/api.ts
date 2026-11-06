import { api } from "../../lib/api";
import type { ListParams, Paginated } from "../../types/api";
import type {
  AjusteInventarioPayload,
  CategoriaProducto,
  Combo,
  ComboPayload,
  DireccionMovimiento,
  MovimientoInventario,
  Producto,
  ProductoPayload,
  TipoMovimiento,
  UnidadMedida,
} from "../../types/inventory";

export interface ProductosParams extends ListParams {
  categoria?: number;
  unidad?: number;
  iva_aplicable?: boolean;
}

export type CombosParams = ListParams;

export interface MovimientosParams extends ListParams {
  producto?: number;
  tipo?: TipoMovimiento;
  direccion?: DireccionMovimiento;
  fecha_desde?: string;
  fecha_hasta?: string;
}

function buildProductoFormData(payload: ProductoPayload): FormData {
  const form = new FormData();
  form.append("sku", payload.sku);
  form.append("nombre", payload.nombre);
  form.append("categoria", String(payload.categoria));
  form.append("unidad", String(payload.unidad));
  form.append("costo", payload.costo);
  form.append("precio", payload.precio);
  form.append("stock_minimo", payload.stock_minimo);
  if (payload.stock_inicial !== undefined) {
    form.append("stock_inicial", payload.stock_inicial);
  }
  form.append("iva_aplicable", payload.iva_aplicable ? "true" : "false");
  form.append("activo", payload.activo ? "true" : "false");
  if (payload.imagen) {
    form.append("imagen", payload.imagen);
  }
  return form;
}

function productoSinImagen(payload: Partial<ProductoPayload>): Partial<ProductoPayload> {
  const { imagen: _imagen, ...rest } = payload;
  return rest;
}

export async function listProductos(params: ProductosParams): Promise<Paginated<Producto>> {
  const { data } = await api.get<Paginated<Producto>>("/productos/", { params });
  return data;
}

export async function createProducto(payload: ProductoPayload): Promise<Producto> {
  const body = payload.imagen ? buildProductoFormData(payload) : productoSinImagen(payload);
  const { data } = await api.post<Producto>("/productos/", body);
  return data;
}

export async function updateProducto(
  id: number,
  payload: Partial<ProductoPayload>,
): Promise<Producto> {
  const { imagen } = payload;
  const { data } = await api.patch<Producto>(
    `/productos/${id}/`,
    imagen ? buildProductoFormData(payload as ProductoPayload) : productoSinImagen(payload),
  );
  return data;
}

export async function listCombos(params: CombosParams): Promise<Paginated<Combo>> {
  const { data } = await api.get<Paginated<Combo>>("/combos/", { params });
  return data;
}

export async function createCombo(payload: ComboPayload): Promise<Combo> {
  const { data } = await api.post<Combo>("/combos/", payload);
  return data;
}

export async function updateCombo(id: number, payload: ComboPayload): Promise<Combo> {
  const { data } = await api.patch<Combo>(`/combos/${id}/`, payload);
  return data;
}

export async function listMovimientos(
  params: MovimientosParams,
): Promise<Paginated<MovimientoInventario>> {
  const { data } = await api.get<Paginated<MovimientoInventario>>("/inventario/movimientos/", {
    params,
  });
  return data;
}

export async function createAjuste(
  payload: AjusteInventarioPayload,
): Promise<MovimientoInventario> {
  const { data } = await api.post<MovimientoInventario>("/inventario/ajustes/", payload);
  return data;
}

export async function listCategorias(): Promise<Paginated<CategoriaProducto>> {
  const { data } = await api.get<Paginated<CategoriaProducto>>("/categorias-producto/", {
    params: { page_size: 100, ordering: "nombre" },
  });
  return data;
}

export async function createCategoria(nombre: string): Promise<CategoriaProducto> {
  const { data } = await api.post<CategoriaProducto>("/categorias-producto/", { nombre });
  return data;
}

export async function listUnidades(): Promise<Paginated<UnidadMedida>> {
  const { data } = await api.get<Paginated<UnidadMedida>>("/unidades-medida/", {
    params: { page_size: 100, ordering: "nombre" },
  });
  return data;
}

export async function createUnidad(payload: {
  nombre: string;
  abreviatura: string;
}): Promise<UnidadMedida> {
  const { data } = await api.post<UnidadMedida>("/unidades-medida/", payload);
  return data;
}
