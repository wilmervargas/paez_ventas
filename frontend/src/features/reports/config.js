import {
  ArrowRightLeft,
  Banknote,
  CreditCard,
  Package,
  ShoppingCart,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";

/** Roles con acceso global al módulo de reportes. */
export const REPORT_ROLES = ["admin", "vendedor", "cobrador", "almacenista"];

export const MONEDAS = [
  { value: "USD", label: "USD — Dólar" },
  { value: "VES", label: "VES — Bolívar" },
  { value: "EUR", label: "EUR — Euro" },
];

const ESTADOS_PEDIDO = [
  { value: "borrador", label: "Borrador" },
  { value: "confirmado", label: "Confirmado" },
  { value: "entregado", label: "Entregado" },
  { value: "anulado", label: "Anulado" },
];

const ESTADOS_DEUDA = [
  { value: "pendiente", label: "Pendiente" },
  { value: "pagada", label: "Pagada" },
  { value: "anulada", label: "Anulada" },
];

const ESTADOS_COMPRA = [
  { value: "borrador", label: "Borrador" },
  { value: "recibida", label: "Recibida" },
  { value: "anulada", label: "Anulada" },
];

const ESTADOS_CAJA = [
  { value: "abierta", label: "Abierta" },
  { value: "cerrada", label: "Cerrada" },
];

const TIPOS_PAGO = [
  { value: "contado", label: "Contado" },
  { value: "credito", label: "Crédito" },
];

const METODOS_PAGO = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "pago_movil", label: "Pago móvil" },
  { value: "zelle", label: "Zelle" },
  { value: "otro", label: "Otro" },
];

const TIPOS_MOVIMIENTO = [
  { value: "entrada", label: "Entrada" },
  { value: "salida", label: "Salida" },
  { value: "ajuste", label: "Ajuste" },
  { value: "venta", label: "Venta" },
  { value: "compra", label: "Compra" },
  { value: "devolucion", label: "Devolución" },
  { value: "anulacion", label: "Anulación" },
];

const DIRECCIONES = [
  { value: "entrada", label: "Entrada" },
  { value: "salida", label: "Salida" },
];

const rangoFechas = [
  { key: "desde", label: "Desde", type: "date" },
  { key: "hasta", label: "Hasta", type: "date" },
];

const filtroCliente = {
  key: "cliente",
  label: "Cliente",
  type: "select",
  optionsKey: "clientes",
  placeholder: "Todos los clientes",
};

const filtroMoneda = {
  key: "moneda",
  label: "Moneda",
  type: "select",
  options: MONEDAS,
  placeholder: "Todas las monedas",
};

const incluirAnulados = {
  key: "incluir_anulados",
  label: "Incluir documentos anulados",
  type: "checkbox",
};

export const REPORTES = [
  {
    tipo: "ventas",
    label: "Ventas",
    titulo: "Reporte de ventas",
    descripcion: "Pedidos emitidos, impuestos, descuentos y ticket promedio.",
    icon: ShoppingCart,
    roles: ["admin", "vendedor"],
    filtros: [
      ...rangoFechas,
      filtroCliente,
      { key: "estado", label: "Estado", type: "select", options: ESTADOS_PEDIDO, placeholder: "Todos los estados" },
      { key: "tipo_pago", label: "Tipo de pago", type: "select", options: TIPOS_PAGO, placeholder: "Todos" },
      filtroMoneda,
      incluirAnulados,
    ],
  },
  {
    tipo: "cxc",
    label: "Cuentas por cobrar",
    titulo: "Cuentas por cobrar",
    descripcion: "Cartera pendiente, antigüedad de saldos y montos vencidos.",
    icon: Wallet,
    roles: ["admin", "vendedor", "cobrador"],
    filtros: [
      ...rangoFechas,
      filtroCliente,
      { key: "estado", label: "Estado", type: "select", options: ESTADOS_DEUDA, placeholder: "Todos los estados" },
      filtroMoneda,
      { key: "solo_vencidas", label: "Solo cuentas vencidas", type: "checkbox" },
      incluirAnulados,
    ],
  },
  {
    tipo: "inventario",
    label: "Inventario",
    titulo: "Reporte de inventario",
    descripcion: "Existencias, stock mínimo y valorización del catálogo.",
    icon: Package,
    roles: ["admin", "vendedor", "almacenista"],
    filtros: [
      { key: "search", label: "Buscar", type: "text", placeholder: "SKU o nombre del producto" },
      { key: "categoria", label: "Categoría", type: "select", optionsKey: "categorias", placeholder: "Todas las categorías" },
      { key: "solo_bajo_stock", label: "Solo stock bajo", type: "checkbox" },
      { key: "incluir_inactivos", label: "Incluir productos inactivos", type: "checkbox" },
    ],
  },
  {
    tipo: "utilidad",
    label: "Utilidad",
    titulo: "Reporte de utilidad",
    descripcion: "Margen por línea vendida con el costo congelado del pedido.",
    icon: TrendingUp,
    roles: ["admin"],
    filtros: [...rangoFechas, filtroCliente, filtroMoneda],
  },
  {
    tipo: "compras",
    label: "Compras",
    titulo: "Reporte de compras",
    descripcion: "Compras a proveedores y su equivalente en moneda base.",
    icon: Truck,
    roles: ["admin", "almacenista"],
    filtros: [
      ...rangoFechas,
      { key: "proveedor", label: "Proveedor", type: "select", optionsKey: "proveedores", placeholder: "Todos los proveedores" },
      { key: "estado", label: "Estado", type: "select", options: ESTADOS_COMPRA, placeholder: "Todos los estados" },
      filtroMoneda,
      incluirAnulados,
    ],
  },
  {
    tipo: "cobranza",
    label: "Cobranza",
    titulo: "Reporte de cobranza",
    descripcion: "Pagos recibidos, métodos de cobro y consolidación en moneda base.",
    icon: CreditCard,
    roles: ["admin", "cobrador"],
    filtros: [
      ...rangoFechas,
      filtroCliente,
      { key: "metodo", label: "Método de pago", type: "select", options: METODOS_PAGO, placeholder: "Todos los métodos" },
      filtroMoneda,
      incluirAnulados,
    ],
  },
  {
    tipo: "caja",
    label: "Caja",
    titulo: "Reporte de caja",
    descripcion: "Sesiones de caja, ingresos, egresos y arqueos del período.",
    icon: Banknote,
    roles: ["admin", "cobrador"],
    filtros: [
      ...rangoFechas,
      { key: "estado", label: "Estado", type: "select", options: ESTADOS_CAJA, placeholder: "Todos los estados" },
    ],
  },
  {
    tipo: "movimientos",
    label: "Movimientos",
    titulo: "Movimientos de inventario",
    descripcion: "Kardex de entradas, salidas, ventas, compras y ajustes.",
    icon: ArrowRightLeft,
    roles: ["admin", "vendedor", "almacenista"],
    filtros: [
      ...rangoFechas,
      { key: "search", label: "Buscar", type: "text", placeholder: "SKU, producto o motivo" },
      { key: "producto", label: "Producto", type: "select", optionsKey: "productos", placeholder: "Todos los productos" },
      { key: "tipo", label: "Tipo", type: "select", options: TIPOS_MOVIMIENTO, placeholder: "Todos los tipos" },
      { key: "direccion", label: "Dirección", type: "select", options: DIRECCIONES, placeholder: "Todas" },
    ],
  },
];

export const REPORTES_POR_TIPO = Object.fromEntries(REPORTES.map((item) => [item.tipo, item]));

export function reportesDisponibles(rol) {
  return REPORTES.filter((item) => item.roles.includes(rol));
}

export function puedeVerReporte(rol, tipo) {
  const reporte = REPORTES_POR_TIPO[tipo];
  return Boolean(reporte && reporte.roles.includes(rol));
}
