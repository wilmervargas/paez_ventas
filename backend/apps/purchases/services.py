"""Servicios de compras: recepción y anulación con efecto atómico en inventario."""

import logging
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone

from apps.common.exceptions import BusinessRuleError
from apps.common.sequences import siguiente_numero
from apps.common.utils.money import money, to_base, to_decimal
from apps.company.services import get_empresa, get_moneda_base, get_tasa_del_dia
from apps.inventory.models import MovimientoInventario, Producto
from apps.inventory.services import registrar_movimiento

from .models import Compra, CompraDetalle

logger = logging.getLogger("auditoria")

CAMPOS_COMPRA = (
    "proveedor",
    "fecha",
    "moneda",
    "divisa",
    "tasa_cambio",
    "otros_montos",
    "numero_referencia",
    "notas",
)


def _validar_modelo(instance) -> None:
    try:
        instance.full_clean()
    except DjangoValidationError as exc:
        raise BusinessRuleError("; ".join(exc.messages)) from exc


def _normalizar_detalles(detalles: list[dict]) -> list[dict]:
    if not detalles:
        raise BusinessRuleError("La compra debe tener al menos una línea.")

    vistos = set()
    normalizados = []
    for detalle in detalles:
        producto = detalle["producto"]
        cantidad = to_decimal(detalle["cantidad"])
        costo_unitario = to_decimal(detalle["costo_unitario"])
        aplica_iva = detalle.get("aplica_iva", True)

        if cantidad <= 0:
            raise BusinessRuleError("La cantidad de cada línea debe ser mayor que cero.")
        if costo_unitario < 0:
            raise BusinessRuleError("El costo unitario no puede ser negativo.")
        if producto.pk in vistos:
            raise BusinessRuleError(f"El producto {producto.sku} está repetido en la compra.")

        vistos.add(producto.pk)
        normalizados.append(
            {
                "producto": producto,
                "cantidad": cantidad,
                "costo_unitario": costo_unitario,
                "aplica_iva": bool(aplica_iva),
            }
        )
    return normalizados


def _resolver_tasa(moneda: str, tasa_cambio, empresa, fecha=None) -> Decimal:
    """Tasa aplicable al documento, congelada en la compra.

    - Si el usuario no envía tasa, se toma la del histórico para la **fecha del
      documento** (retroactivos incluidos): la última registrada con vigencia
      anterior o igual a ese día.
    - Si la envía, se respeta como sobrescritura manual y queda registrada en el
      log de auditoría.
    """
    moneda = (moneda or empresa.moneda_base or "USD").upper()
    if moneda == empresa.moneda_base.upper():
        return Decimal("1.000000")

    vigente = get_tasa_del_dia(moneda, fecha, base=empresa.moneda_base)
    if tasa_cambio is not None:
        tasa = to_decimal(tasa_cambio)
        if vigente is None or vigente.tasa != tasa:
            logger.info(
                "Compras: tasa manual %s %s para documento del %s (tasa del día: %s)",
                tasa,
                moneda,
                fecha,
                vigente.tasa if vigente else "sin tasa",
            )
    else:
        if vigente is None:
            raise BusinessRuleError(
                f"No hay una tasa de cambio vigente para {moneda} al {fecha}. "
                "Registra la tasa del día o envíala manualmente."
            )
        tasa = vigente.tasa

    if tasa <= 0:
        raise BusinessRuleError("La tasa de cambio debe ser mayor que cero.")
    return tasa


def _calcular_totales(
    detalles: list[dict], iva_rate, otros_montos: Decimal
) -> tuple[Decimal, Decimal, Decimal]:
    subtotal = Decimal("0.00")
    base_iva = Decimal("0.00")
    for detalle in detalles:
        detalle["subtotal"] = money(detalle["cantidad"] * detalle["costo_unitario"])
        subtotal += detalle["subtotal"]
        if detalle.get("aplica_iva", True):
            base_iva += detalle["subtotal"]
    subtotal = money(subtotal)
    base_iva = money(base_iva)
    iva = money(base_iva * to_decimal(iva_rate) / Decimal("100"))
    otros_montos = money(otros_montos)
    total = money(subtotal + iva + otros_montos)
    return subtotal, iva, total


def _preparar_datos(data: dict, empresa, detalles: list[dict]) -> dict:
    datos = {campo: data[campo] for campo in CAMPOS_COMPRA if campo in data}
    fecha = datos.get("fecha") or timezone.localdate()
    moneda = (datos.get("moneda") or empresa.moneda_base or "USD").upper()
    tasa = _resolver_tasa(moneda, datos.get("tasa_cambio"), empresa, fecha)
    datos["divisa"] = _normalizar_divisa(datos.get("divisa"), moneda, empresa)
    otros_montos = money(to_decimal(datos.get("otros_montos", 0)))
    if otros_montos < 0:
        raise BusinessRuleError("Los otros montos no pueden ser negativos.")
    datos["otros_montos"] = otros_montos
    if "numero_referencia" in datos and datos["numero_referencia"] is not None:
        datos["numero_referencia"] = str(datos["numero_referencia"]).strip()

    # Congela la tasa BCV (Bs por 1 USD) vigente en la fecha del documento para
    # poder mostrar equivalentes históricos aunque el registro de tasas cambie.
    tasa_bcv = get_tasa_del_dia("VES", fecha, base="USD")

    normalizados = _normalizar_detalles(detalles)
    subtotal, iva, total = _calcular_totales(normalizados, empresa.iva_rate, otros_montos)

    datos.update(
        {
            "fecha": fecha,
            "moneda": moneda,
            "tasa_cambio": tasa,
            "subtotal": subtotal,
            "iva": iva,
            "total": total,
            "total_base": to_base(total, tasa),
            "tasa_bcv": tasa_bcv.tasa if tasa_bcv else None,
            "tasa_bcv_vigente_desde": tasa_bcv.vigente_desde if tasa_bcv else None,
        }
    )
    return datos, normalizados


def _guardar_detalles(compra: Compra, detalles: list[dict], user=None) -> None:
    CompraDetalle.objects.bulk_create(
        [
            CompraDetalle(
                compra=compra,
                producto=detalle["producto"],
                cantidad=detalle["cantidad"],
                costo_unitario=detalle["costo_unitario"],
                aplica_iva=detalle.get("aplica_iva", True),
                subtotal=detalle["subtotal"],
                created_by=user if user and user.is_authenticated else None,
            )
            for detalle in detalles
        ]
    )


def _normalizar_divisa(divisa, moneda: str, empresa) -> str:
    """Divisa convertible en la que se expresan los costos de la compra."""
    valor = (divisa or "").strip().upper()
    if valor:
        return valor[:4]
    moneda = (moneda or "").upper()
    if moneda and moneda != "VES":
        return moneda
    return (get_moneda_base(empresa) or "USD").upper()


def _tasa_base_en_bs(empresa, compra: Compra) -> Decimal | None:
    """Bolívares por 1 unidad de la moneda base, congelados en la compra."""
    moneda_base = get_moneda_base(empresa)
    if moneda_base == "VES":
        return Decimal("1")
    if moneda_base == "USD" and compra.tasa_bcv:
        return to_decimal(compra.tasa_bcv)
    tasa = get_tasa_del_dia("VES", compra.fecha, base=moneda_base)
    return to_decimal(tasa.tasa) if tasa else None


def _costos_movimiento(
    compra: Compra,
    costo_documento,
    moneda_base: str,
    tasa_base: Decimal | None,
) -> tuple[Decimal, Decimal, Decimal, str]:
    """Traduce el costo de la línea a divisa, bolívares y moneda base.

    Devuelve `(costo_divisa, costo_bs, costo_base, divisa)`.
    """
    costo_doc = to_decimal(costo_documento)
    moneda_doc = (compra.moneda or moneda_base).upper()
    divisa = (compra.divisa or moneda_doc).upper()
    tasa_doc = to_decimal(compra.tasa_cambio)

    if moneda_doc == "VES":
        costo_bs = costo_doc
        if divisa and divisa != "VES" and tasa_doc > 0:
            costo_divisa = costo_bs / tasa_doc
        else:
            costo_divisa = costo_bs
    else:
        # La línea ya está en la moneda del documento (p. ej. USD).
        divisa = moneda_doc
        costo_divisa = costo_doc
        if moneda_doc == moneda_base:
            costo_bs = costo_doc * tasa_base if tasa_base else Decimal("0")
        elif tasa_base and tasa_doc > 0:
            # `tasa_doc` son unidades de la moneda del documento por 1 base.
            costo_bs = costo_doc * tasa_base / tasa_doc
        else:
            costo_bs = Decimal("0")

    if divisa == moneda_base:
        costo_base = costo_divisa
    elif moneda_base == "VES":
        costo_base = costo_bs
    elif tasa_base:
        costo_base = costo_bs / tasa_base
    else:
        # Sin tasa base disponible no se puede cruzar: se conserva la divisa.
        costo_base = costo_divisa

    return costo_divisa, costo_bs, costo_base, divisa


def _registrar_movimiento_compra(
    compra: Compra,
    detalle: CompraDetalle,
    *,
    tipo: str,
    direccion: str,
    motivo: str,
    referencia_tipo: str,
    moneda_base: str,
    tasa_base: Decimal | None,
    user=None,
) -> None:
    """Registra el movimiento de kardex con el costo en la divisa de la compra."""
    costo_divisa, costo_bs, costo_base, divisa = _costos_movimiento(
        compra,
        detalle.costo_unitario,
        moneda_base,
        tasa_base,
    )
    registrar_movimiento(
        detalle.producto,
        tipo=tipo,
        direccion=direccion,
        cantidad=detalle.cantidad,
        costo_unitario=costo_divisa,
        costo_unitario_bs=costo_bs,
        costo_unitario_base=costo_base,
        moneda=divisa,
        tasa_cambio=Decimal("1") if divisa == "VES" else compra.tasa_cambio,
        motivo=motivo,
        referencia_tipo=referencia_tipo,
        referencia_id=compra.pk,
        user=user,
    )


@transaction.atomic
def crear_compra(data: dict, detalles: list[dict], user=None) -> Compra:
    """Crea una compra en borrador con costos congelados y numeración anual."""
    empresa = get_empresa()
    if empresa is None:
        raise BusinessRuleError("Primero configura los datos fiscales de la empresa.")

    datos, detalles_normalizados = _preparar_datos(data, empresa, detalles)
    numero = siguiente_numero("compra", "COMP", datos["fecha"].year)

    compra = Compra(
        **datos,
        numero=numero,
        estado=Compra.Estado.BORRADOR,
        created_by=user if user and user.is_authenticated else None,
    )
    _validar_modelo(compra)
    compra.save()
    _guardar_detalles(compra, detalles_normalizados, user=user)

    logger.info("Compras: %s creada por %s", compra.numero, getattr(user, "email", "sistema"))
    return compra


@transaction.atomic
def actualizar_compra(compra: Compra, data: dict, detalles: list[dict], user=None) -> Compra:
    """Actualiza una compra en borrador. Una compra recibida no se edita."""
    compra = Compra.objects.select_for_update().get(pk=compra.pk)
    if compra.estado != Compra.Estado.BORRADOR:
        raise BusinessRuleError("Solo se pueden editar compras en borrador.")

    empresa = get_empresa()
    if empresa is None:
        raise BusinessRuleError("Primero configura los datos fiscales de la empresa.")

    datos, detalles_normalizados = _preparar_datos(data, empresa, detalles)
    for campo, valor in datos.items():
        setattr(compra, campo, valor)
    _validar_modelo(compra)
    compra.save()

    compra.detalles.all().delete()
    _guardar_detalles(compra, detalles_normalizados, user=user)

    logger.info("Compras: %s actualizada por %s", compra.numero, getattr(user, "email", "sistema"))
    return compra


@transaction.atomic
def recibir_compra(compra: Compra, user=None) -> Compra:
    """Marca la compra como recibida y genera las entradas al inventario."""
    compra = Compra.objects.select_for_update().get(pk=compra.pk)
    if compra.estado != Compra.Estado.BORRADOR:
        raise BusinessRuleError("Solo se pueden recibir compras en borrador.")

    empresa = get_empresa()
    moneda_base = get_moneda_base(empresa)
    tasa_base = _tasa_base_en_bs(empresa, compra)

    for detalle in compra.detalles.select_related("producto"):
        _registrar_movimiento_compra(
            compra,
            detalle,
            tipo=MovimientoInventario.Tipo.COMPRA,
            direccion=MovimientoInventario.Direccion.ENTRADA,
            motivo=f"Compra {compra.numero}",
            referencia_tipo="compra",
            moneda_base=moneda_base,
            tasa_base=tasa_base,
            user=user,
        )

    compra.estado = Compra.Estado.RECIBIDA
    compra.save(update_fields=["estado", "updated_at"])
    logger.info(
        "Compras: %s recibida por %s",
        compra.numero,
        getattr(user, "email", "sistema"),
    )
    return compra


@transaction.atomic
def anular_compra(compra: Compra, motivo: str, user=None) -> Compra:
    """Anula una compra. Si ya fue recibida, revierte el stock atómicamente."""
    compra = Compra.objects.select_for_update().get(pk=compra.pk)
    motivo = (motivo or "").strip()
    if not motivo:
        raise BusinessRuleError("Indica el motivo de la anulación.")
    if compra.estado == Compra.Estado.ANULADA:
        raise BusinessRuleError("La compra ya está anulada.")

    if compra.estado == Compra.Estado.RECIBIDA:
        empresa = get_empresa()
        moneda_base = get_moneda_base(empresa)
        tasa_base = _tasa_base_en_bs(empresa, compra)
        for detalle in compra.detalles.select_related("producto"):
            _registrar_movimiento_compra(
                compra,
                detalle,
                tipo=MovimientoInventario.Tipo.ANULACION,
                direccion=MovimientoInventario.Direccion.SALIDA,
                motivo=f"Anulación de compra {compra.numero}: {motivo}",
                referencia_tipo="compra_anulada",
                moneda_base=moneda_base,
                tasa_base=tasa_base,
                user=user,
            )

    compra.estado = Compra.Estado.ANULADA
    compra.motivo_anulacion = motivo
    compra.anulado_por = user if user and user.is_authenticated else None
    compra.fecha_anulacion = timezone.now()
    compra.save(
        update_fields=[
            "estado",
            "motivo_anulacion",
            "anulado_por",
            "fecha_anulacion",
            "updated_at",
        ]
    )
    logger.info(
        "Compras: %s anulada por %s. Motivo: %s",
        compra.numero,
        getattr(user, "email", "sistema"),
        motivo,
    )
    return compra


def producto_compra(producto_id: int) -> Producto | None:
    """Helper para serializers que necesitan un producto activo."""
    return Producto.objects.filter(pk=producto_id).first()
