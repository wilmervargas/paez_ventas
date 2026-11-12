import { api } from "../../lib/api";
function buildProductoFormData(payload) {
    const form = new FormData();
    form.append("sku", String(payload.sku ?? ""));
    form.append("nombre", String(payload.nombre ?? ""));
    form.append("categoria", String(payload.categoria));
    form.append("unidad", String(payload.unidad));
    form.append("costo", String(payload.costo ?? "0.00"));
    form.append("precio", String(payload.precio ?? "0.00"));
    form.append("stock_minimo", String(payload.stock_minimo ?? "0.000"));
    if (payload.stock_inicial !== undefined) {
        form.append("stock_inicial", payload.stock_inicial);
    }
    form.append("iva_aplicable", payload.iva_aplicable ? "true" : "false");
    form.append("activo", payload.activo ? "true" : "false");
    // `""` pide al backend borrar la imagen guardada; sin valor no se toca.
    if (payload.imagen instanceof File || payload.imagen === "") {
        form.append("imagen", payload.imagen);
    }
    return form;
}
function productoSinImagen(payload) {
    const { imagen: _imagen, ...rest } = payload;
    return rest;
}
/** ¿El payload exige multipart (imagen nueva o borrado de imagen)? */
function usaFormData(payload) {
    return payload.imagen instanceof File || payload.imagen === "";
}
export async function listProductos(params) {
    const { data } = await api.get("/productos/", { params });
    return data;
}
export async function createProducto(payload) {
    const body = usaFormData(payload) ? buildProductoFormData(payload) : productoSinImagen(payload);
    const { data } = await api.post("/productos/", body);
    return data;
}
export async function updateProducto(id, payload) {
    const body = usaFormData(payload) ? buildProductoFormData(payload) : productoSinImagen(payload);
    const { data } = await api.patch(`/productos/${id}/`, body);
    return data;
}
export async function deleteProducto(id) {
    await api.delete(`/productos/${id}/`);
}
export async function listCombos(params) {
    const { data } = await api.get("/combos/", { params });
    return data;
}
export async function createCombo(payload) {
    const { data } = await api.post("/combos/", payload);
    return data;
}
export async function updateCombo(id, payload) {
    const { data } = await api.patch(`/combos/${id}/`, payload);
    return data;
}
export async function deleteCombo(id) {
    await api.delete(`/combos/${id}/`);
}
export async function listMovimientos(params) {
    const { data } = await api.get("/inventario/movimientos/", {
        params,
    });
    return data;
}
export async function createAjuste(payload) {
    const { data } = await api.post("/inventario/ajustes/", payload);
    return data;
}
export async function listCategorias() {
    const { data } = await api.get("/categorias-producto/", {
        params: { page_size: 100, ordering: "nombre" },
    });
    return data;
}
export async function createCategoria(nombre) {
    const { data } = await api.post("/categorias-producto/", { nombre });
    return data;
}
export async function deleteCategoria(id) {
    await api.delete(`/categorias-producto/${id}/`);
}
export async function listUnidades() {
    const { data } = await api.get("/unidades-medida/", {
        params: { page_size: 100, ordering: "nombre" },
    });
    return data;
}
export async function createUnidad(payload) {
    const { data } = await api.post("/unidades-medida/", payload);
    return data;
}
export async function deleteUnidad(id) {
    await api.delete(`/unidades-medida/${id}/`);
}
