"""Servicios de reportes: consultas, filtros y consolidación en moneda base.

Cada constructor devuelve un payload listo para la API y para los exportadores
(PDF/Excel). Los montos viajan como strings decimales para no perder precisión.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import F, Q
from django.utils import timezone

from apps.clients.models import Cliente, Proveedor
from apps.common.utils.money import money, to_base, to_decimal
from apps.company.services import get_empresa, get_moneda_base
from apps.finances.models import CajaSesion, Deuda, Pago
from apps.inventory.models import MovimientoInventario, Producto
from apps.orders.models import Pedido, PedidoDetalle
from apps.purchases.models import Compra

MAX_ROWS = 10000
TWO = Decimal("0.01")
THREE = Decimal("0.001")
SIX = Decimal("0.000001")
HUNDRED = Decimal("100")


# ---------------------------------------------------------------------------
# Utilidades de formato
# ---------------------------------------------------------------------------


def _q(value, places: Decimal = TWO) -> str:
    """Cuantiza un decimal y lo devuelve como string con punto decimal."""
    return str(to_decimal(value).quantize(places, rounding=ROUND_HALF_UP))


def _money(value) -> str:
    return _q(money(value), TWO)


def _qty(value) -> str:
    return _q(value, THREE)


def _rate(value) -> str:
    return _q(value or Decimal("1"), SIX)


def _percent(value) -> str:
    return _q(value, TWO)


def _int(value) -> int:
    return int(value or 0)


def _safe_base(amount, tasa) -> Decimal:
    """Convierte a moneda base protegiendo contra tasas inválidas."""
    tasa_dec = to_decimal(tasa or Decimal("1"))
    if tasa_dec <= 0:
        tasa_dec = Decimal("1")
    return to_base(amount, tasa_dec)


def _fecha_corta(value: date | datetime | None) -> str:
    if not value:
        return ""
    return value.strftime("%d/%m/%Y")


def _filtros_aplicados(filtros: dict, extra: list[tuple[str, str]] | None = None) -> list[dict]:
    items: list[dict] = []
    if filtros.get("desde"):
        items.append({"label": "Desde", "value": _fecha_corta(filtros["desde"])})
    if filtros.get("hasta"):
        items.append({"label": "Hasta", "value": _fecha_corta(filtros["hasta"])})
    if filtros.get("moneda"):
        items.append({"label": "Moneda", "value": str(filtros["moneda"]).upper()})
    for label, value in extra or []:
        if value:
            items.append({"label": label, "value": value})
    if filtros.get("incluir_anulados"):
        items.append({"label": "Anulados", "value": "Incluidos"})
    if filtros.get("solo_vencidas"):
        items.append({"label": "Solo vencidas", "value": "Sí"})
    if filtros.get("solo_bajo_stock"):
        items.append({"label": "Solo stock bajo", "value": "Sí"})
    if filtros.get("incluir_inactivos"):
        items.append({"label": "Inactivos", "value": "Incluidos"})
    return items


def _aplicar_rango(qs, campo: str, filtros: dict, es_datetime: bool = False):
    desde = filtros.get("desde")
    hasta = filtros.get("hasta")
    sufijo = "__date" if es_datetime else ""
    if desde:
        qs = qs.filter(**{f"{campo}{sufijo}__gte": desde})
    if hasta:
        qs = qs.filter(**{f"{campo}{sufijo}__lte": hasta})
    return qs


def _col(
    key: str,
    label: str,
    tipo: str = "text",
    currency: str | None = None,
    align: str | None = None,
) -> dict:
    data = {"key": key, "label": label, "type": tipo}
    if currency:
        data["currency"] = currency
    if align:
        data["align"] = align
    elif tipo in {"money", "qty", "int", "percent", "rate"}:
        data["align"] = "right"
    return data


def _payload(
    *,
    slug: str,
    titulo: str,
    descripcion: str,
    filtros: dict,
    filtros_extra: list[tuple[str, str]] | None,
    columnas: list[dict],
    filas: list[dict],
    resumen: list[dict],
    fila_totales: dict | None = None,
) -> dict:
    total = len(filas)
    return {
        "tipo": slug,
        "titulo": titulo,
        "descripcion": descripcion,
        "generado_en": timezone.now().isoformat(),
        "moneda_base": get_moneda_base(get_empresa()),
        "filtros_aplicados": _filtros_aplicados(filtros, filtros_extra),
        "columnas": columnas,
        "filas": filas[:MAX_ROWS],
        "resumen": resumen,
        "fila_totales": fila_totales or {},
        "total_filas": total,
        "truncado": total > MAX_ROWS,
    }


def _nombre_cliente(filtros: dict) -> str:
    if not filtros.get("cliente"):
        return ""
    return (
        Cliente.objects.filter(pk=filtros["cliente"]).values_list("nombre", flat=True).first() or ""
    )


def _nombre_proveedor(filtros: dict) -> str:
    if not filtros.get("proveedor"):
        return ""
    return (
        Proveedor.objects.filter(pk=filtros["proveedor"]).values_list("nombre", flat=True).first()
        or ""
    )


def _nombre_categoria(filtros: dict) -> str:
    if not filtros.get("categoria"):
        return ""
    from apps.inventory.models import CategoriaProducto

    return (
        CategoriaProducto.objects.filter(pk=filtros["categoria"])
        .values_list("nombre", flat=True)
        .first()
        or ""
    )


def _resumen_item(label: str, value, tipo: str = "money", currency: str = "base") -> dict:
    item = {"label": label, "value": value, "type": tipo}
    if tipo == "money":
        item["currency"] = currency
    return item


# ---------------------------------------------------------------------------
# Ventas
# ---------------------------------------------------------------------------


def build_ventas(filtros: dict, user) -> dict:
    qs = Pedido.objects.select_related("cliente").all()
    estado = (filtros.get("estado") or "").strip()
    if estado:
        qs = qs.filter(estado=estado)
    elif not filtros.get("incluir_anulados"):
        qs = qs.exclude(estado=Pedido.Estado.ANULADO)
    qs = _aplicar_rango(qs, "fecha", filtros)
    if filtros.get("cliente"):
        qs = qs.filter(cliente_id=filtros["cliente"])
    if filtros.get("moneda"):
        qs = qs.filter(moneda=str(filtros["moneda"]).upper())
    if filtros.get("tipo_pago"):
        qs = qs.filter(tipo_pago=filtros["tipo_pago"])

    pedidos = list(qs.order_by("-fecha", "-numero"))
    filas = []
    total_base = Decimal("0.00")
    iva_base = Decimal("0.00")
    descuento_base = Decimal("0.00")
    contado_base = Decimal("0.00")
    credito_base = Decimal("0.00")

    for pedido in pedidos:
        base = _safe_base(pedido.total, pedido.tasa_cambio)
        total_base += base
        iva_base += _safe_base(pedido.iva, pedido.tasa_cambio)
        descuento_base += _safe_base(pedido.descuento, pedido.tasa_cambio)
        if pedido.tipo_pago == Pedido.TipoPago.CREDITO:
            credito_base += base
        else:
            contado_base += base
        filas.append(
            {
                "numero": pedido.numero,
                "fecha": pedido.fecha.isoformat() if pedido.fecha else "",
                "cliente": pedido.cliente.nombre,
                "estado": pedido.get_estado_display(),
                "tipo_pago": pedido.get_tipo_pago_display(),
                "moneda": pedido.moneda,
                "tasa_cambio": _rate(pedido.tasa_cambio),
                "subtotal": _money(pedido.subtotal),
                "descuento": _money(pedido.descuento),
                "iva": _money(pedido.iva),
                "total": _money(pedido.total),
                "total_base": _money(base),
            }
        )

    ticket = total_base / len(pedidos) if pedidos else Decimal("0.00")
    columnas = [
        _col("numero", "Número"),
        _col("fecha", "Fecha", "date"),
        _col("cliente", "Cliente"),
        _col("estado", "Estado", "badge"),
        _col("tipo_pago", "Tipo de pago"),
        _col("moneda", "Moneda", align="center"),
        _col("tasa_cambio", "Tasa", "rate"),
        _col("subtotal", "Subtotal", "money", "row"),
        _col("descuento", "Descuento", "money", "row"),
        _col("iva", "IVA", "money", "row"),
        _col("total", "Total", "money", "row"),
        _col("total_base", "Total base", "money", "base"),
    ]
    resumen = [
        _resumen_item("Pedidos", len(pedidos), "int"),
        _resumen_item("Total facturado", _money(total_base)),
        _resumen_item("IVA", _money(iva_base)),
        _resumen_item("Descuentos", _money(descuento_base)),
        _resumen_item("Contado", _money(contado_base)),
        _resumen_item("Crédito", _money(credito_base)),
        _resumen_item("Ticket promedio", _money(ticket)),
    ]
    return _payload(
        slug="ventas",
        titulo="Reporte de ventas",
        descripcion="Pedidos emitidos en el período, con totales consolidados en moneda base.",
        filtros=filtros,
        filtros_extra=[("Cliente", _nombre_cliente(filtros))],
        columnas=columnas,
        filas=filas,
        resumen=resumen,
        fila_totales={"total_base": _money(total_base)},
    )


# ---------------------------------------------------------------------------
# Cuentas por cobrar
# ---------------------------------------------------------------------------


def build_cxc(filtros: dict, user) -> dict:
    qs = Deuda.objects.select_related("cliente", "pedido").all()
    estado = (filtros.get("estado") or "").strip()
    if estado:
        qs = qs.filter(estado=estado)
    elif not filtros.get("incluir_anulados"):
        qs = qs.exclude(estado=Deuda.Estado.ANULADA)
    qs = _aplicar_rango(qs, "fecha_emision", filtros)
    if filtros.get("cliente"):
        qs = qs.filter(cliente_id=filtros["cliente"])
    if filtros.get("moneda"):
        qs = qs.filter(moneda=str(filtros["moneda"]).upper())
    if filtros.get("solo_vencidas"):
        qs = qs.filter(
            estado=Deuda.Estado.PENDIENTE,
            saldo__gt=0,
            fecha_vencimiento__lt=timezone.localdate(),
        )

    deudas = list(qs.order_by("fecha_vencimiento", "-fecha_emision", "-id"))
    hoy = timezone.localdate()
    filas = []
    saldo_base = Decimal("0.00")
    original_base = Decimal("0.00")
    vencido_base = Decimal("0.00")
    vencidas = 0
    aging = {
        "corriente": Decimal("0.00"),
        "d1_30": Decimal("0.00"),
        "d31_60": Decimal("0.00"),
        "d61_90": Decimal("0.00"),
        "d90_mas": Decimal("0.00"),
    }

    for deuda in deudas:
        base = _safe_base(deuda.saldo, deuda.tasa_cambio)
        saldo_base += base
        original_base += _safe_base(deuda.monto_original, deuda.tasa_cambio)
        dias = 0
        if deuda.saldo > 0 and deuda.fecha_vencimiento and hoy > deuda.fecha_vencimiento:
            dias = (hoy - deuda.fecha_vencimiento).days
            vencidas += 1
            vencido_base += base
        if dias <= 0:
            aging["corriente"] += base
        elif dias <= 30:
            aging["d1_30"] += base
        elif dias <= 60:
            aging["d31_60"] += base
        elif dias <= 90:
            aging["d61_90"] += base
        else:
            aging["d90_mas"] += base
        filas.append(
            {
                "pedido": deuda.pedido.numero,
                "cliente": deuda.cliente.nombre,
                "codigo": deuda.cliente.codigo,
                "fecha_emision": deuda.fecha_emision.isoformat() if deuda.fecha_emision else "",
                "fecha_vencimiento": (
                    deuda.fecha_vencimiento.isoformat() if deuda.fecha_vencimiento else ""
                ),
                "moneda": deuda.moneda,
                "monto_original": _money(deuda.monto_original),
                "saldo": _money(deuda.saldo),
                "saldo_base": _money(base),
                "estado": deuda.get_estado_display(),
                "dias_vencida": dias,
            }
        )

    columnas = [
        _col("pedido", "Pedido"),
        _col("cliente", "Cliente"),
        _col("codigo", "Código"),
        _col("fecha_emision", "Emisión", "date"),
        _col("fecha_vencimiento", "Vencimiento", "date"),
        _col("moneda", "Moneda", align="center"),
        _col("monto_original", "Monto original", "money", "row"),
        _col("saldo", "Saldo", "money", "row"),
        _col("saldo_base", "Saldo base", "money", "base"),
        _col("estado", "Estado", "badge"),
        _col("dias_vencida", "Días vencida", "int"),
    ]
    resumen = [
        _resumen_item("Cuentas", len(deudas), "int"),
        _resumen_item("Monto original", _money(original_base)),
        _resumen_item("Saldo pendiente", _money(saldo_base)),
        _resumen_item("Cuentas vencidas", vencidas, "int"),
        _resumen_item("Saldo vencido", _money(vencido_base)),
        _resumen_item("Corriente", _money(aging["corriente"])),
        _resumen_item("1 a 30 días", _money(aging["d1_30"])),
        _resumen_item("31 a 60 días", _money(aging["d31_60"])),
        _resumen_item("61 a 90 días", _money(aging["d61_90"])),
        _resumen_item("Más de 90 días", _money(aging["d90_mas"])),
    ]
    return _payload(
        slug="cxc",
        titulo="Cuentas por cobrar",
        descripcion="Cartera de clientes, antigüedad de saldos y montos vencidos.",
        filtros=filtros,
        filtros_extra=[("Cliente", _nombre_cliente(filtros))],
        columnas=columnas,
        filas=filas,
        resumen=resumen,
        fila_totales={"saldo_base": _money(saldo_base)},
    )


# ---------------------------------------------------------------------------
# Inventario
# ---------------------------------------------------------------------------


def build_inventario(filtros: dict, user) -> dict:
    qs = Producto.objects.select_related("categoria", "unidad").all()
    if not filtros.get("incluir_inactivos"):
        qs = qs.filter(activo=True)
    if filtros.get("categoria"):
        qs = qs.filter(categoria_id=filtros["categoria"])
    if filtros.get("solo_bajo_stock"):
        qs = qs.filter(stock__lte=F("stock_minimo"))
    search = (filtros.get("search") or "").strip()
    if search:
        qs = qs.filter(Q(sku__icontains=search) | Q(nombre__icontains=search))

    productos = list(qs.order_by("nombre"))
    es_admin = getattr(user, "rol", None) == "admin"
    filas = []
    unidades = Decimal("0.000")
    valor_precio = Decimal("0.00")
    valor_costo = Decimal("0.00")
    bajo_stock = 0

    for producto in productos:
        bajo = producto.stock <= producto.stock_minimo
        if bajo:
            bajo_stock += 1
        unidades += producto.stock
        valor_precio += money(producto.stock * producto.precio)
        valor_costo += money(producto.stock * producto.costo)
        fila = {
            "sku": producto.sku,
            "nombre": producto.nombre,
            "categoria": producto.categoria.nombre,
            "unidad": producto.unidad.abreviatura,
            "stock": _qty(producto.stock),
            "stock_minimo": _qty(producto.stock_minimo),
            "estado_stock": "Bajo" if bajo else "OK",
            "precio": _money(producto.precio),
            "valor_precio": _money(producto.stock * producto.precio),
        }
        if es_admin:
            fila["costo"] = _money(producto.costo)
            fila["valor_costo"] = _money(producto.stock * producto.costo)
        filas.append(fila)

    columnas = [
        _col("sku", "SKU"),
        _col("nombre", "Producto"),
        _col("categoria", "Categoría"),
        _col("unidad", "Unidad", align="center"),
        _col("stock", "Stock", "qty"),
        _col("stock_minimo", "Stock mínimo", "qty"),
        _col("estado_stock", "Nivel", "badge"),
    ]
    if es_admin:
        columnas.append(_col("costo", "Costo", "money", "base"))
    columnas.extend(
        [
            _col("precio", "Precio", "money", "base"),
            _col("valor_precio", "Valor a precio", "money", "base"),
        ]
    )
    if es_admin:
        columnas.append(_col("valor_costo", "Valor a costo", "money", "base"))

    resumen = [
        _resumen_item("Productos", len(productos), "int"),
        _resumen_item("Unidades en stock", _qty(unidades), "qty"),
        _resumen_item("Con stock bajo", bajo_stock, "int"),
        _resumen_item("Valor a precio", _money(valor_precio)),
    ]
    if es_admin:
        resumen.append(_resumen_item("Valor a costo", _money(valor_costo)))
    fila_totales = {"stock": _qty(unidades), "valor_precio": _money(valor_precio)}
    if es_admin:
        fila_totales["valor_costo"] = _money(valor_costo)

    return _payload(
        slug="inventario",
        titulo="Reporte de inventario",
        descripcion="Existencias, stock mínimo y valorización del catálogo.",
        filtros=filtros,
        filtros_extra=[("Categoría", _nombre_categoria(filtros)), ("Búsqueda", search)],
        columnas=columnas,
        filas=filas,
        resumen=resumen,
        fila_totales=fila_totales,
    )


# ---------------------------------------------------------------------------
# Utilidad
# ---------------------------------------------------------------------------


def build_utilidad(filtros: dict, user) -> dict:
    qs = PedidoDetalle.objects.select_related("pedido__cliente").filter(
        pedido__estado__in=(Pedido.Estado.CONFIRMADO, Pedido.Estado.ENTREGADO)
    )
    qs = _aplicar_rango(qs, "pedido__fecha", filtros)
    if filtros.get("cliente"):
        qs = qs.filter(pedido__cliente_id=filtros["cliente"])
    if filtros.get("moneda"):
        qs = qs.filter(pedido__moneda=str(filtros["moneda"]).upper())

    detalles = list(qs.order_by("-pedido__fecha", "-pedido__numero", "id"))
    filas = []
    venta_base = Decimal("0.00")
    costo_base = Decimal("0.00")
    utilidad_base = Decimal("0.00")
    cantidad_total = Decimal("0.000")

    for detalle in detalles:
        pedido = detalle.pedido
        tasa = pedido.tasa_cambio
        venta = money(detalle.subtotal)
        costo = money(detalle.costo_unitario * detalle.cantidad)
        utilidad = money(venta - costo)
        margen = (utilidad / venta * HUNDRED) if venta > 0 else Decimal("0.00")
        venta_base += _safe_base(venta, tasa)
        costo_base += _safe_base(costo, tasa)
        utilidad_base += _safe_base(utilidad, tasa)
        cantidad_total += detalle.cantidad
        filas.append(
            {
                "pedido": pedido.numero,
                "fecha": pedido.fecha.isoformat() if pedido.fecha else "",
                "cliente": pedido.cliente.nombre,
                "estado": pedido.get_estado_display(),
                "descripcion": detalle.descripcion or "—",
                "cantidad": _qty(detalle.cantidad),
                "moneda": pedido.moneda,
                "precio_unitario": _money(detalle.precio_unitario),
                "costo_unitario": _money(detalle.costo_unitario),
                "venta": _money(venta),
                "costo": _money(costo),
                "utilidad": _money(utilidad),
                "margen_pct": _percent(margen),
                "utilidad_base": _money(_safe_base(utilidad, tasa)),
            }
        )

    margen_global = (utilidad_base / venta_base * HUNDRED) if venta_base > 0 else Decimal("0.00")
    columnas = [
        _col("pedido", "Pedido"),
        _col("fecha", "Fecha", "date"),
        _col("cliente", "Cliente"),
        _col("estado", "Estado", "badge"),
        _col("descripcion", "Descripción"),
        _col("cantidad", "Cantidad", "qty"),
        _col("moneda", "Moneda", align="center"),
        _col("precio_unitario", "Precio unit.", "money", "row"),
        _col("costo_unitario", "Costo unit.", "money", "row"),
        _col("venta", "Venta", "money", "row"),
        _col("costo", "Costo", "money", "row"),
        _col("utilidad", "Utilidad", "money", "row"),
        _col("margen_pct", "Margen", "percent"),
        _col("utilidad_base", "Utilidad base", "money", "base"),
    ]
    resumen = [
        _resumen_item("Líneas vendidas", len(detalles), "int"),
        _resumen_item("Unidades", _qty(cantidad_total), "qty"),
        _resumen_item("Ventas", _money(venta_base)),
        _resumen_item("Costo", _money(costo_base)),
        _resumen_item("Utilidad", _money(utilidad_base)),
        _resumen_item("Margen global", _percent(margen_global), "percent"),
    ]
    return _payload(
        slug="utilidad",
        titulo="Reporte de utilidad",
        descripcion="Margen por línea vendida usando el costo congelado del pedido.",
        filtros=filtros,
        filtros_extra=[("Cliente", _nombre_cliente(filtros))],
        columnas=columnas,
        filas=filas,
        resumen=resumen,
        fila_totales={"utilidad_base": _money(utilidad_base)},
    )


# ---------------------------------------------------------------------------
# Compras
# ---------------------------------------------------------------------------


def build_compras(filtros: dict, user) -> dict:
    qs = Compra.objects.select_related("proveedor").all()
    estado = (filtros.get("estado") or "").strip()
    if estado:
        qs = qs.filter(estado=estado)
    elif not filtros.get("incluir_anulados"):
        qs = qs.exclude(estado=Compra.Estado.ANULADA)
    qs = _aplicar_rango(qs, "fecha", filtros)
    if filtros.get("proveedor"):
        qs = qs.filter(proveedor_id=filtros["proveedor"])
    if filtros.get("moneda"):
        qs = qs.filter(moneda=str(filtros["moneda"]).upper())

    compras = list(qs.order_by("-fecha", "-numero"))
    filas = []
    total_base = Decimal("0.00")
    iva_base = Decimal("0.00")

    for compra in compras:
        base = _safe_base(compra.total, compra.tasa_cambio)
        total_base += base
        iva_base += _safe_base(compra.iva, compra.tasa_cambio)
        filas.append(
            {
                "numero": compra.numero,
                "fecha": compra.fecha.isoformat() if compra.fecha else "",
                "proveedor": compra.proveedor.nombre,
                "estado": compra.get_estado_display(),
                "moneda": compra.moneda,
                "tasa_cambio": _rate(compra.tasa_cambio),
                "subtotal": _money(compra.subtotal),
                "iva": _money(compra.iva),
                "total": _money(compra.total),
                "total_base": _money(base),
            }
        )

    columnas = [
        _col("numero", "Número"),
        _col("fecha", "Fecha", "date"),
        _col("proveedor", "Proveedor"),
        _col("estado", "Estado", "badge"),
        _col("moneda", "Moneda", align="center"),
        _col("tasa_cambio", "Tasa", "rate"),
        _col("subtotal", "Subtotal", "money", "row"),
        _col("iva", "IVA", "money", "row"),
        _col("total", "Total", "money", "row"),
        _col("total_base", "Total base", "money", "base"),
    ]
    resumen = [
        _resumen_item("Compras", len(compras), "int"),
        _resumen_item("Total comprado", _money(total_base)),
        _resumen_item("IVA", _money(iva_base)),
    ]
    return _payload(
        slug="compras",
        titulo="Reporte de compras",
        descripcion="Compras a proveedores y su equivalente en moneda base.",
        filtros=filtros,
        filtros_extra=[("Proveedor", _nombre_proveedor(filtros))],
        columnas=columnas,
        filas=filas,
        resumen=resumen,
        fila_totales={"total_base": _money(total_base)},
    )


# ---------------------------------------------------------------------------
# Cobranza (pagos)
# ---------------------------------------------------------------------------


def build_cobranza(filtros: dict, user) -> dict:
    qs = Pago.objects.select_related("cliente").all()
    if not filtros.get("incluir_anulados"):
        qs = qs.filter(anulado=False)
    qs = _aplicar_rango(qs, "fecha_pago", filtros)
    if filtros.get("cliente"):
        qs = qs.filter(cliente_id=filtros["cliente"])
    if filtros.get("metodo"):
        qs = qs.filter(metodo=filtros["metodo"])
    if filtros.get("moneda"):
        qs = qs.filter(moneda=str(filtros["moneda"]).upper())

    pagos = list(qs.order_by("-fecha_pago", "-numero"))
    filas = []
    total_base = Decimal("0.00")
    por_metodo: dict[str, Decimal] = {}

    for pago in pagos:
        base = money(pago.monto_base)
        total_base += base
        metodo_label = pago.get_metodo_display()
        por_metodo[metodo_label] = por_metodo.get(metodo_label, Decimal("0.00")) + base
        filas.append(
            {
                "numero": pago.numero,
                "fecha_pago": pago.fecha_pago.isoformat() if pago.fecha_pago else "",
                "cliente": pago.cliente.nombre,
                "metodo": metodo_label,
                "referencia": pago.referencia or "—",
                "banco": pago.banco or "—",
                "moneda": pago.moneda,
                "tasa_cambio": _rate(pago.tasa_cambio),
                "monto": _money(pago.monto),
                "monto_base": _money(base),
                "estado": "Anulado" if pago.anulado else "Aplicado",
            }
        )

    ticket = total_base / len(pagos) if pagos else Decimal("0.00")
    resumen = [
        _resumen_item("Pagos", len(pagos), "int"),
        _resumen_item("Total cobrado", _money(total_base)),
        _resumen_item("Ticket promedio", _money(ticket)),
    ]
    for metodo, monto in sorted(por_metodo.items()):
        resumen.append(_resumen_item(metodo, _money(monto)))

    columnas = [
        _col("numero", "Número"),
        _col("fecha_pago", "Fecha", "date"),
        _col("cliente", "Cliente"),
        _col("metodo", "Método"),
        _col("referencia", "Referencia"),
        _col("banco", "Banco"),
        _col("moneda", "Moneda", align="center"),
        _col("tasa_cambio", "Tasa", "rate"),
        _col("monto", "Monto", "money", "row"),
        _col("monto_base", "Monto base", "money", "base"),
        _col("estado", "Estado", "badge"),
    ]
    return _payload(
        slug="cobranza",
        titulo="Reporte de cobranza",
        descripcion="Pagos recibidos y su consolidación en moneda base.",
        filtros=filtros,
        filtros_extra=[("Cliente", _nombre_cliente(filtros))],
        columnas=columnas,
        filas=filas,
        resumen=resumen,
        fila_totales={"monto_base": _money(total_base)},
    )


# ---------------------------------------------------------------------------
# Caja
# ---------------------------------------------------------------------------


def build_caja(filtros: dict, user) -> dict:
    qs = CajaSesion.objects.select_related("usuario_apertura", "usuario_cierre").prefetch_related(
        "movimientos"
    )
    qs = _aplicar_rango(qs, "fecha_apertura", filtros, es_datetime=True)
    if filtros.get("estado"):
        qs = qs.filter(estado=filtros["estado"])

    sesiones = list(qs.order_by("-fecha_apertura", "-id"))
    filas = []
    total_ingresos = Decimal("0.00")
    total_egresos = Decimal("0.00")
    abiertas = 0

    for sesion in sesiones:
        if sesion.estado == CajaSesion.Estado.ABIERTA:
            abiertas += 1
        ingresos = Decimal("0.00")
        egresos = Decimal("0.00")
        for movimiento in sesion.movimientos.all():
            if movimiento.tipo == movimiento.Tipo.INGRESO:
                ingresos += money(movimiento.monto_base)
            else:
                egresos += money(movimiento.monto_base)
        neto = money(ingresos - egresos)
        total_ingresos += ingresos
        total_egresos += egresos
        filas.append(
            {
                "id": sesion.pk,
                "fecha_apertura": (
                    timezone.localtime(sesion.fecha_apertura).isoformat()
                    if sesion.fecha_apertura
                    else ""
                ),
                "fecha_cierre": (
                    timezone.localtime(sesion.fecha_cierre).isoformat()
                    if sesion.fecha_cierre
                    else ""
                ),
                "usuario": sesion.usuario_apertura.nombre,
                "estado": sesion.get_estado_display(),
                "moneda": sesion.moneda,
                "monto_inicial": _money(sesion.monto_inicial),
                "ingresos": _money(ingresos),
                "egresos": _money(egresos),
                "neto": _money(neto),
                "monto_sistema": (
                    _money(sesion.monto_sistema) if sesion.monto_sistema is not None else ""
                ),
                "monto_declarado": (
                    _money(sesion.monto_final_declarado)
                    if sesion.monto_final_declarado is not None
                    else ""
                ),
                "diferencia": _money(sesion.diferencia) if sesion.diferencia is not None else "",
            }
        )

    neto_total = money(total_ingresos - total_egresos)
    columnas = [
        _col("id", "Caja", "int"),
        _col("fecha_apertura", "Apertura", "datetime"),
        _col("fecha_cierre", "Cierre", "datetime"),
        _col("usuario", "Usuario"),
        _col("estado", "Estado", "badge"),
        _col("moneda", "Moneda", align="center"),
        _col("monto_inicial", "Monto inicial", "money", "row"),
        _col("ingresos", "Ingresos base", "money", "base"),
        _col("egresos", "Egresos base", "money", "base"),
        _col("neto", "Neto base", "money", "base"),
        _col("monto_sistema", "Sistema", "money", "row"),
        _col("monto_declarado", "Declarado", "money", "row"),
        _col("diferencia", "Diferencia", "money", "row"),
    ]
    resumen = [
        _resumen_item("Sesiones", len(sesiones), "int"),
        _resumen_item("Abiertas", abiertas, "int"),
        _resumen_item("Ingresos", _money(total_ingresos)),
        _resumen_item("Egresos", _money(total_egresos)),
        _resumen_item("Neto", _money(neto_total)),
    ]
    return _payload(
        slug="caja",
        titulo="Reporte de caja",
        descripcion="Sesiones de caja, movimientos y arqueos del período.",
        filtros=filtros,
        filtros_extra=[],
        columnas=columnas,
        filas=filas,
        resumen=resumen,
        fila_totales={
            "ingresos": _money(total_ingresos),
            "egresos": _money(total_egresos),
            "neto": _money(neto_total),
        },
    )


# ---------------------------------------------------------------------------
# Movimientos de inventario (kardex)
# ---------------------------------------------------------------------------


def build_movimientos(filtros: dict, user) -> dict:
    qs = MovimientoInventario.objects.select_related("producto").all()
    qs = _aplicar_rango(qs, "created_at", filtros, es_datetime=True)
    if filtros.get("tipo"):
        qs = qs.filter(tipo=filtros["tipo"])
    if filtros.get("direccion"):
        qs = qs.filter(direccion=filtros["direccion"])
    if filtros.get("producto"):
        qs = qs.filter(producto_id=filtros["producto"])
    search = (filtros.get("search") or "").strip()
    if search:
        qs = qs.filter(
            Q(producto__sku__icontains=search)
            | Q(producto__nombre__icontains=search)
            | Q(motivo__icontains=search)
        )

    movimientos = list(qs.order_by("-created_at", "-id"))
    filas = []
    entradas = 0
    salidas = 0
    valor_entradas = Decimal("0.00")
    valor_salidas = Decimal("0.00")

    for movimiento in movimientos:
        valor = money(movimiento.costo_unitario * movimiento.cantidad)
        if movimiento.direccion == MovimientoInventario.Direccion.ENTRADA:
            entradas += 1
            valor_entradas += valor
        else:
            salidas += 1
            valor_salidas += valor
        referencia = ""
        if movimiento.referencia_tipo:
            referencia = movimiento.referencia_tipo
            if movimiento.referencia_id:
                referencia = f"{referencia} #{movimiento.referencia_id}"
        filas.append(
            {
                "fecha": (
                    timezone.localtime(movimiento.created_at).isoformat()
                    if movimiento.created_at
                    else ""
                ),
                "producto": f"{movimiento.producto.sku} · {movimiento.producto.nombre}",
                "tipo": movimiento.get_tipo_display(),
                "direccion": movimiento.get_direccion_display(),
                "cantidad": _qty(movimiento.cantidad),
                "costo_unitario": _money(movimiento.costo_unitario),
                "valor": _money(valor),
                "motivo": movimiento.motivo or "—",
                "referencia": referencia or "—",
            }
        )

    columnas = [
        _col("fecha", "Fecha", "datetime"),
        _col("producto", "Producto"),
        _col("tipo", "Tipo"),
        _col("direccion", "Dirección", "badge"),
        _col("cantidad", "Cantidad", "qty"),
        _col("costo_unitario", "Costo unit.", "money", "base"),
        _col("valor", "Valor", "money", "base"),
        _col("motivo", "Motivo"),
        _col("referencia", "Referencia"),
    ]
    resumen = [
        _resumen_item("Movimientos", len(movimientos), "int"),
        _resumen_item("Entradas", entradas, "int"),
        _resumen_item("Salidas", salidas, "int"),
        _resumen_item("Valor entradas", _money(valor_entradas)),
        _resumen_item("Valor salidas", _money(valor_salidas)),
    ]
    return _payload(
        slug="movimientos",
        titulo="Movimientos de inventario",
        descripcion="Kardex de entradas, salidas, ventas, compras y ajustes.",
        filtros=filtros,
        filtros_extra=[("Búsqueda", search)],
        columnas=columnas,
        filas=filas,
        resumen=resumen,
    )


# ---------------------------------------------------------------------------
# Registro de reportes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ReporteDef:
    slug: str
    titulo: str
    descripcion: str
    roles: tuple[str, ...]
    builder: Callable[[dict, object], dict]


REPORTES: dict[str, ReporteDef] = {
    "ventas": ReporteDef(
        "ventas",
        "Reporte de ventas",
        "Pedidos emitidos y totales consolidados en moneda base.",
        ("admin", "vendedor"),
        build_ventas,
    ),
    "cxc": ReporteDef(
        "cxc",
        "Cuentas por cobrar",
        "Cartera pendiente, antigüedad de saldos y montos vencidos.",
        ("admin", "vendedor", "cobrador"),
        build_cxc,
    ),
    "inventario": ReporteDef(
        "inventario",
        "Reporte de inventario",
        "Existencias, stock mínimo y valorización del catálogo.",
        ("admin", "vendedor", "almacenista"),
        build_inventario,
    ),
    "utilidad": ReporteDef(
        "utilidad",
        "Reporte de utilidad",
        "Margen por línea vendida con el costo congelado del pedido.",
        ("admin",),
        build_utilidad,
    ),
    "compras": ReporteDef(
        "compras",
        "Reporte de compras",
        "Compras a proveedores y su equivalente en moneda base.",
        ("admin", "almacenista"),
        build_compras,
    ),
    "cobranza": ReporteDef(
        "cobranza",
        "Reporte de cobranza",
        "Pagos recibidos y su consolidación en moneda base.",
        ("admin", "cobrador"),
        build_cobranza,
    ),
    "caja": ReporteDef(
        "caja",
        "Reporte de caja",
        "Sesiones de caja, movimientos y arqueos del período.",
        ("admin", "cobrador"),
        build_caja,
    ),
    "movimientos": ReporteDef(
        "movimientos",
        "Movimientos de inventario",
        "Kardex de entradas, salidas, ventas, compras y ajustes.",
        ("admin", "vendedor", "almacenista"),
        build_movimientos,
    ),
}


def get_reporte_def(tipo: str) -> ReporteDef | None:
    return REPORTES.get(tipo)


def construir_reporte(tipo: str, filtros: dict, user) -> dict:
    definition = get_reporte_def(tipo)
    if definition is None:
        raise KeyError(tipo)
    return definition.builder(filtros, user)
