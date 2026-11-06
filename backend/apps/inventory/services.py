"""Servicios de inventario: única vía para modificar stock y costos."""

import logging
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction

from apps.common.exceptions import BusinessRuleError
from apps.common.utils.money import money, to_decimal

from .models import (
    CategoriaProducto,
    Combo,
    ComboProducto,
    MovimientoInventario,
    Producto,
    UnidadMedida,
)

logger = logging.getLogger("auditoria")

CUATRO_DECIMALES = Decimal("0.0001")

DIRECCION_POR_TIPO = {
    MovimientoInventario.Tipo.ENTRADA: MovimientoInventario.Direccion.ENTRADA,
    MovimientoInventario.Tipo.COMPRA: MovimientoInventario.Direccion.ENTRADA,
    MovimientoInventario.Tipo.DEVOLUCION: MovimientoInventario.Direccion.ENTRADA,
    MovimientoInventario.Tipo.SALIDA: MovimientoInventario.Direccion.SALIDA,
    MovimientoInventario.Tipo.VENTA: MovimientoInventario.Direccion.SALIDA,
}


def _validar_modelo(instance) -> None:
    try:
        instance.full_clean()
    except DjangoValidationError as exc:
        raise BusinessRuleError("; ".join(exc.messages)) from exc


@transaction.atomic
def registrar_movimiento(
    producto: Producto,
    *,
    tipo: str,
    cantidad,
    direccion: str | None = None,
    costo_unitario=None,
    motivo: str = "",
    referencia_tipo: str = "",
    referencia_id: int | None = None,
    user=None,
) -> MovimientoInventario:
    """Registra un movimiento y actualiza el stock/costo del producto.

    La cantidad siempre es positiva; `direccion` define el signo.
    """
    producto = Producto.objects.select_for_update().get(pk=producto.pk)

    cantidad_dec = to_decimal(cantidad)
    if cantidad_dec <= 0:
        raise BusinessRuleError("La cantidad debe ser mayor que cero.")

    direccion = direccion or DIRECCION_POR_TIPO.get(tipo)
    if direccion not in MovimientoInventario.Direccion.values:
        raise BusinessRuleError("Debes indicar si el ajuste es una entrada o una salida.")

    if costo_unitario is None:
        costo_unitario_dec = to_decimal(producto.costo)
    else:
        costo_unitario_dec = to_decimal(costo_unitario)
    if costo_unitario_dec < 0:
        raise BusinessRuleError("El costo unitario no puede ser negativo.")

    delta = cantidad_dec if direccion == MovimientoInventario.Direccion.ENTRADA else -cantidad_dec
    nuevo_stock = producto.stock + delta
    if nuevo_stock < 0:
        raise BusinessRuleError(
            f"Stock insuficiente para {producto.sku}: disponible {producto.stock}, "
            f"requerido {cantidad_dec}."
        )

    movimiento = MovimientoInventario(
        producto=producto,
        tipo=tipo,
        direccion=direccion,
        cantidad=cantidad_dec,
        costo_unitario=costo_unitario_dec.quantize(CUATRO_DECIMALES, rounding=ROUND_HALF_UP),
        motivo=motivo,
        referencia_tipo=referencia_tipo,
        referencia_id=referencia_id,
        created_by=user if user and user.is_authenticated else None,
    )
    _validar_modelo(movimiento)

    if direccion == MovimientoInventario.Direccion.ENTRADA and costo_unitario_dec > 0:
        costo_anterior = to_decimal(producto.costo)
        if producto.stock > 0:
            costo_promedio = (
                producto.stock * costo_anterior + cantidad_dec * costo_unitario_dec
            ) / nuevo_stock
        else:
            costo_promedio = costo_unitario_dec
        producto.costo = money(costo_promedio)

    movimiento.save()
    producto.stock = nuevo_stock
    producto.save(update_fields=["stock", "costo", "updated_at"])

    logger.info(
        "Inventario: %s %s %s de %s (stock=%s) motivo=%s usuario=%s",
        tipo,
        direccion,
        cantidad_dec,
        producto.sku,
        producto.stock,
        motivo,
        getattr(user, "email", "sistema"),
    )
    return movimiento


@transaction.atomic
def crear_producto(data: dict, user=None) -> Producto:
    """Crea un producto y carga el stock inicial mediante un ajuste."""
    data = dict(data)
    stock_inicial = to_decimal(data.pop("stock_inicial", 0) or 0)
    if stock_inicial < 0:
        raise BusinessRuleError("El stock inicial no puede ser negativo.")

    producto = Producto(**data, stock=Decimal("0.000"))
    if user is not None and user.is_authenticated:
        producto.created_by = user
    _validar_modelo(producto)
    producto.save()

    if stock_inicial > 0:
        registrar_movimiento(
            producto,
            tipo=MovimientoInventario.Tipo.AJUSTE,
            direccion=MovimientoInventario.Direccion.ENTRADA,
            cantidad=stock_inicial,
            costo_unitario=producto.costo,
            motivo="Stock inicial",
            user=user,
        )
        producto.refresh_from_db()
    return producto


@transaction.atomic
def actualizar_producto(producto: Producto, data: dict, user=None) -> Producto:
    """Actualiza datos del producto. El stock no se toca por esta vía."""
    costo_anterior = producto.costo
    precio_anterior = producto.precio

    for field, value in data.items():
        setattr(producto, field, value)
    _validar_modelo(producto)
    producto.save()

    if producto.precio != precio_anterior or producto.costo != costo_anterior:
        logger.info(
            "Catálogo: cambios de precio/costo en %s (precio %s -> %s, costo %s -> %s) usuario=%s",
            producto.sku,
            precio_anterior,
            producto.precio,
            costo_anterior,
            producto.costo,
            getattr(user, "email", "sistema"),
        )
    return producto


def disponibilidad_combo(combo: Combo) -> int:
    """Unidades de combo disponibles según el stock de sus componentes."""
    componentes = list(combo.componentes.select_related("producto"))
    if not componentes:
        return 0
    return min(
        int(
            (componente.producto.stock / componente.cantidad).to_integral_value(
                rounding=ROUND_FLOOR
            )
        )
        for componente in componentes
    )


def _preparar_componentes(componentes: list[dict]) -> list[dict]:
    if not componentes:
        raise BusinessRuleError("El combo debe tener al menos un componente.")

    vistos = set()
    preparados = []
    for componente in componentes:
        producto = componente["producto"]
        cantidad = to_decimal(componente["cantidad"])
        if cantidad <= 0:
            raise BusinessRuleError("La cantidad de cada componente debe ser mayor que cero.")
        if producto.pk in vistos:
            raise BusinessRuleError(f"El producto {producto.sku} está repetido en el combo.")
        vistos.add(producto.pk)
        preparados.append({"producto": producto, "cantidad": cantidad})
    return preparados


@transaction.atomic
def crear_combo(data: dict, componentes: list[dict], user=None) -> Combo:
    componentes = _preparar_componentes(componentes)
    combo = Combo(**data)
    if user is not None and user.is_authenticated:
        combo.created_by = user
    _validar_modelo(combo)
    combo.save()

    ComboProducto.objects.bulk_create(
        [
            ComboProducto(
                combo=combo,
                producto=componente["producto"],
                cantidad=componente["cantidad"],
                created_by=user if user and user.is_authenticated else None,
            )
            for componente in componentes
        ]
    )
    logger.info("Catálogo: combo %s creado por %s", combo.sku, getattr(user, "email", "sistema"))
    return combo


@transaction.atomic
def actualizar_combo(combo: Combo, data: dict, componentes: list[dict] | None, user=None) -> Combo:
    for field, value in data.items():
        setattr(combo, field, value)
    _validar_modelo(combo)
    combo.save()

    if componentes is not None:
        preparados = _preparar_componentes(componentes)
        combo.componentes.all().delete()
        ComboProducto.objects.bulk_create(
            [
                ComboProducto(
                    combo=combo,
                    producto=componente["producto"],
                    cantidad=componente["cantidad"],
                    created_by=user if user and user.is_authenticated else None,
                )
                for componente in preparados
            ]
        )
    logger.info(
        "Catálogo: combo %s actualizado por %s", combo.sku, getattr(user, "email", "sistema")
    )
    return combo


def seed_inventario() -> None:
    """Datos semilla idempotentes para catálogo."""
    for nombre in ("General", "Alimentos", "Bebidas", "Limpieza", "Ferretería", "Otros"):
        CategoriaProducto.objects.get_or_create(nombre=nombre)

    unidades = (
        ("Unidad", "UND"),
        ("Caja", "CJA"),
        ("Paquete", "PQT"),
        ("Docena", "DOC"),
        ("Kilogramo", "KG"),
        ("Litro", "L"),
    )
    for nombre, abreviatura in unidades:
        UnidadMedida.objects.get_or_create(
            abreviatura=abreviatura,
            defaults={"nombre": nombre},
        )
