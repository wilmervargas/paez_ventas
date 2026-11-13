"""Servicios de pedidos: creación, confirmación, anulación y entrega."""

import logging
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone

from apps.common.exceptions import BusinessRuleError
from apps.common.sequences import siguiente_numero
from apps.common.utils.money import money, to_base, to_decimal
from apps.company.services import get_empresa, get_tasa_del_dia
from apps.finances.models import Deuda
from apps.inventory.models import MovimientoInventario, Producto
from apps.inventory.services import registrar_movimiento

from .models import Pedido, PedidoDetalle

logger = logging.getLogger("auditoria")

CAMPOS_PEDIDO = (
    "cliente",
    "fecha",
    "moneda",
    "tasa_cambio",
    "tipo_pago",
    "descuento",
    "otros_montos",
    "numero_referencia",
    "notas",
)

TWO_PLACES = Decimal("0.01")


def _validar_modelo(instance) -> None:
    try:
        instance.full_clean()
    except DjangoValidationError as exc:
        raise BusinessRuleError("; ".join(exc.messages)) from exc


def _normalizar_detalles(detalles: list[dict], iva_rate: Decimal) -> list[dict]:
    if not detalles:
        raise BusinessRuleError("El pedido debe tener al menos una línea.")

    vistos_productos = set()
    vistos_combos = set()
    normalizados = []

    for indice, detalle in enumerate(detalles):
        producto = detalle.get("producto")
        combo = detalle.get("combo")
        cantidad = to_decimal(detalle.get("cantidad"))
        precio_unitario = to_decimal(detalle.get("precio_unitario"))
        descuento_linea = to_decimal(detalle.get("descuento_linea", 0))
        aplica_iva = detalle.get("aplica_iva", True)

        if cantidad <= 0:
            raise BusinessRuleError(
                f"La cantidad de la línea {indice + 1} debe ser mayor que cero."
            )
        if precio_unitario < 0:
            raise BusinessRuleError(
                f"El precio unitario de la línea {indice + 1} no puede ser negativo."
            )
        if descuento_linea < 0:
            raise BusinessRuleError(f"El descuento de la línea {indice + 1} no puede ser negativo.")

        if producto is not None and combo is not None:
            raise BusinessRuleError(
                f"La línea {indice + 1} no puede tener producto y combo a la vez."
            )
        if producto is None and combo is None:
            raise BusinessRuleError(f"La línea {indice + 1} debe tener un producto o un combo.")

        if producto is not None:
            if producto.pk in vistos_productos:
                raise BusinessRuleError(f"El producto {producto.sku} está repetido en el pedido.")
            vistos_productos.add(producto.pk)
            if precio_unitario == 0:
                precio_unitario = producto.precio
        else:
            if combo.pk in vistos_combos:
                raise BusinessRuleError(f"El combo {combo.sku} está repetido en el pedido.")
            vistos_combos.add(combo.pk)
            if precio_unitario == 0:
                precio_unitario = combo.precio

        # Snapshot de composición del combo (congelada al momento de la venta).
        combo_snapshot = {}
        if combo is not None:
            componentes = list(combo.componentes.select_related("producto"))
            if not componentes:
                raise BusinessRuleError(f"El combo {combo.sku} no tiene componentes definidos.")
            combo_snapshot = {
                "combo_id": combo.pk,
                "combo_sku": combo.sku,
                "combo_nombre": combo.nombre,
                "componentes": [
                    {
                        "producto_id": c.producto.pk,
                        "producto_sku": c.producto.sku,
                        "producto_nombre": c.producto.nombre,
                        "cantidad": str(c.cantidad),
                    }
                    for c in componentes
                ],
            }

        bruto_linea = money(cantidad * precio_unitario)
        subtotal_linea = money(bruto_linea - descuento_linea)
        if subtotal_linea < 0:
            subtotal_linea = Decimal("0.00")
        aplica_iva = bool(aplica_iva)
        iva_linea = (
            money(subtotal_linea * to_decimal(iva_rate) / Decimal("100"))
            if aplica_iva
            else Decimal("0.00")
        )

        normalizados.append(
            {
                "producto": producto,
                "combo": combo,
                "descripcion": detalle.get("descripcion", "") or "",
                "cantidad": cantidad,
                "precio_unitario": money(precio_unitario),
                "costo_unitario": to_decimal(
                    producto.costo if producto is not None else combo.precio
                ),
                "descuento_linea": money(descuento_linea),
                "aplica_iva": aplica_iva,
                "iva_linea": iva_linea,
                "subtotal": subtotal_linea,
                "combo_snapshot": combo_snapshot,
            }
        )

    return normalizados


def _resolver_tasa(moneda: str, tasa_cambio, empresa, fecha=None) -> Decimal:
    """Tasa aplicable al pedido, congelada en el documento.

    - Sin tasa en el payload se usa la del histórico para la fecha del pedido.
    - Con tasa, se respeta como sobrescritura manual y se audita.
    """
    moneda = (moneda or empresa.moneda_base or "USD").upper()
    if moneda == empresa.moneda_base.upper():
        return Decimal("1.000000")

    vigente = get_tasa_del_dia(moneda, fecha, base=empresa.moneda_base)
    if tasa_cambio is not None:
        tasa = to_decimal(tasa_cambio)
        if vigente is None or vigente.tasa != tasa:
            logger.info(
                "Pedidos: tasa manual %s %s para documento del %s (tasa del día: %s)",
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


@transaction.atomic
def crear_pedido(data: dict, detalles: list[dict], user=None) -> Pedido:
    """Crea un pedido en borrador con totales calculados y numeración anual.

    El stock no se afecta hasta que se confirma el pedido.
    """
    empresa = get_empresa()
    if empresa is None:
        raise BusinessRuleError("Primero configura los datos fiscales de la empresa.")

    datos = {campo: data[campo] for campo in CAMPOS_PEDIDO if campo in data}
    fecha = datos.get("fecha") or timezone.localdate()
    moneda = (datos.get("moneda") or empresa.moneda_base or "USD").upper()
    tasa = _resolver_tasa(moneda, datos.get("tasa_cambio"), empresa, fecha)
    otros_montos = money(to_decimal(datos.get("otros_montos", 0)))
    if otros_montos < 0:
        raise BusinessRuleError("Los otros montos no pueden ser negativos.")
    datos["otros_montos"] = otros_montos
    if "numero_referencia" in datos and datos["numero_referencia"] is not None:
        datos["numero_referencia"] = str(datos["numero_referencia"]).strip()

    normalizados = _normalizar_detalles(detalles, empresa.iva_rate)

    subtotal = Decimal("0.00")
    iva_total = Decimal("0.00")
    descuento_total = Decimal("0.00")
    for detalle in normalizados:
        subtotal += detalle["subtotal"]
        iva_total += detalle["iva_linea"]
        descuento_total += detalle["descuento_linea"]

    subtotal = money(subtotal)
    iva_total = money(iva_total)
    descuento_total = money(descuento_total)
    total = money(subtotal + iva_total + otros_montos)

    # Congela la tasa BCV (Bs por 1 USD) vigente en la fecha del documento.
    tasa_bcv = get_tasa_del_dia("VES", fecha, base="USD")

    datos.update(
        {
            "fecha": fecha,
            "moneda": moneda,
            "tasa_cambio": tasa,
            "subtotal": subtotal,
            "descuento": descuento_total,
            "iva": iva_total,
            "otros_montos": otros_montos,
            "total": total,
            "total_base": to_base(total, tasa),
            "tasa_bcv": tasa_bcv.tasa if tasa_bcv else None,
            "tasa_bcv_vigente_desde": tasa_bcv.vigente_desde if tasa_bcv else None,
            "estado": Pedido.Estado.BORRADOR,
        }
    )

    numero = siguiente_numero("pedido", "PED", datos["fecha"].year)

    pedido = Pedido(
        **datos,
        numero=numero,
        created_by=user if user and user.is_authenticated else None,
    )
    _validar_modelo(pedido)
    pedido.save()

    PedidoDetalle.objects.bulk_create(
        [
            PedidoDetalle(
                pedido=pedido,
                producto=d["producto"],
                combo=d["combo"],
                descripcion=d["descripcion"],
                cantidad=d["cantidad"],
                precio_unitario=d["precio_unitario"],
                costo_unitario=d["costo_unitario"],
                descuento_linea=d["descuento_linea"],
                aplica_iva=d.get("aplica_iva", True),
                iva_linea=d["iva_linea"],
                subtotal=d["subtotal"],
                combo_snapshot=d["combo_snapshot"],
                created_by=user if user and user.is_authenticated else None,
            )
            for d in normalizados
        ]
    )

    logger.info(
        "Pedidos: %s creado por %s (estado=%s)",
        pedido.numero,
        getattr(user, "email", "sistema"),
        pedido.estado,
    )
    return pedido


@transaction.atomic
def actualizar_pedido(pedido: Pedido, data: dict, detalles: list[dict] | None, user=None) -> Pedido:
    """Actualiza un pedido en borrador. Un pedido confirmado no se edita."""
    pedido = Pedido.objects.select_for_update().get(pk=pedido.pk)
    if pedido.estado != Pedido.Estado.BORRADOR:
        raise BusinessRuleError("Solo se pueden editar pedidos en borrador.")

    empresa = get_empresa()
    if empresa is None:
        raise BusinessRuleError("Primero configura los datos fiscales de la empresa.")

    datos = {campo: data[campo] for campo in CAMPOS_PEDIDO if campo in data}
    fecha = datos.get("fecha") or pedido.fecha
    moneda = (datos.get("moneda") or pedido.moneda or empresa.moneda_base or "USD").upper()
    tasa = _resolver_tasa(moneda, datos.get("tasa_cambio"), empresa, fecha)

    otros_montos = money(to_decimal(datos.get("otros_montos", pedido.otros_montos)))
    if otros_montos < 0:
        raise BusinessRuleError("Los otros montos no pueden ser negativos.")
    datos["otros_montos"] = otros_montos
    if "numero_referencia" in datos and datos["numero_referencia"] is not None:
        datos["numero_referencia"] = str(datos["numero_referencia"]).strip()

    if detalles is None:
        detalles = [
            {
                "producto": d.producto,
                "combo": d.combo,
                "cantidad": d.cantidad,
                "precio_unitario": d.precio_unitario,
                "descuento_linea": d.descuento_linea,
                "aplica_iva": d.aplica_iva,
                "descripcion": d.descripcion,
            }
            for d in pedido.detalles.select_related("producto", "combo")
        ]

    normalizados = _normalizar_detalles(detalles, empresa.iva_rate)

    subtotal = Decimal("0.00")
    iva_total = Decimal("0.00")
    descuento_total = Decimal("0.00")
    for d in normalizados:
        subtotal += d["subtotal"]
        iva_total += d["iva_linea"]
        descuento_total += d["descuento_linea"]

    subtotal = money(subtotal)
    iva_total = money(iva_total)
    descuento_total = money(descuento_total)
    total = money(subtotal + iva_total + otros_montos)

    for campo, valor in datos.items():
        setattr(pedido, campo, valor)
    tasa_bcv = get_tasa_del_dia("VES", fecha, base="USD")

    pedido.fecha = fecha
    pedido.moneda = moneda
    pedido.tasa_cambio = tasa
    pedido.subtotal = subtotal
    pedido.descuento = descuento_total
    pedido.iva = iva_total
    pedido.otros_montos = otros_montos
    pedido.total = total
    pedido.total_base = to_base(total, tasa)
    pedido.tasa_bcv = tasa_bcv.tasa if tasa_bcv else None
    pedido.tasa_bcv_vigente_desde = tasa_bcv.vigente_desde if tasa_bcv else None
    _validar_modelo(pedido)
    pedido.save()

    pedido.detalles.all().delete()
    PedidoDetalle.objects.bulk_create(
        [
            PedidoDetalle(
                pedido=pedido,
                producto=d["producto"],
                combo=d["combo"],
                descripcion=d["descripcion"],
                cantidad=d["cantidad"],
                precio_unitario=d["precio_unitario"],
                costo_unitario=d["costo_unitario"],
                descuento_linea=d["descuento_linea"],
                aplica_iva=d.get("aplica_iva", True),
                iva_linea=d["iva_linea"],
                subtotal=d["subtotal"],
                combo_snapshot=d["combo_snapshot"],
                created_by=user if user and user.is_authenticated else None,
            )
            for d in normalizados
        ]
    )

    logger.info("Pedidos: %s actualizado por %s", pedido.numero, getattr(user, "email", "sistema"))
    return pedido


@transaction.atomic
def confirmar_pedido(pedido: Pedido, user=None) -> Pedido:
    """Confirma el pedido: descuenta stock y, si es a crédito, crea la deuda."""
    pedido = Pedido.objects.select_for_update().get(pk=pedido.pk)
    if pedido.estado != Pedido.Estado.BORRADOR:
        raise BusinessRuleError("Solo se pueden confirmar pedidos en borrador.")

    empresa = get_empresa()
    if empresa is None:
        raise BusinessRuleError("Primero configura los datos fiscales de la empresa.")

    for detalle in pedido.detalles.select_related("producto", "combo"):
        if detalle.producto is not None:
            producto = Producto.objects.select_for_update().get(pk=detalle.producto.pk)
            registrar_movimiento(
                producto,
                tipo=MovimientoInventario.Tipo.VENTA,
                direccion=MovimientoInventario.Direccion.SALIDA,
                cantidad=detalle.cantidad,
                costo_unitario=detalle.costo_unitario,
                motivo=f"Pedido {pedido.numero}",
                referencia_tipo="pedido",
                referencia_id=pedido.pk,
                user=user,
            )
        else:
            combo = detalle.combo
            snapshot = detalle.combo_snapshot or {}
            snapshot_componentes = snapshot.get("componentes", [])

            if snapshot_componentes:
                componentes_iter = [
                    {
                        "producto_id": c["producto_id"],
                        "cantidad": c["cantidad"],
                    }
                    for c in snapshot_componentes
                ]
            else:
                componentes_iter = [
                    {
                        "producto_id": c.producto.pk,
                        "cantidad": str(c.cantidad),
                    }
                    for c in combo.componentes.select_related("producto").all()
                ]

            for comp in componentes_iter:
                producto = Producto.objects.select_for_update().get(pk=comp["producto_id"])
                cantidad_componente = (to_decimal(comp["cantidad"]) * detalle.cantidad).quantize(
                    Decimal("0.001"), rounding=ROUND_HALF_UP
                )
                registrar_movimiento(
                    producto,
                    tipo=MovimientoInventario.Tipo.VENTA,
                    direccion=MovimientoInventario.Direccion.SALIDA,
                    cantidad=cantidad_componente,
                    costo_unitario=producto.costo,
                    motivo=f"Pedido {pedido.numero} (combo {combo.sku})",
                    referencia_tipo="pedido",
                    referencia_id=pedido.pk,
                    user=user,
                )

    pedido.estado = Pedido.Estado.CONFIRMADO
    pedido.save(update_fields=["estado", "updated_at"])

    if pedido.tipo_pago == Pedido.TipoPago.CREDITO:
        fecha_vencimiento = None
        _crear_deuda_desde_pedido(pedido, fecha_vencimiento, user=user)

    logger.info(
        "Pedidos: %s confirmado por %s (tipo_pago=%s)",
        pedido.numero,
        getattr(user, "email", "sistema"),
        pedido.tipo_pago,
    )
    return pedido


def _crear_deuda_desde_pedido(pedido: Pedido, fecha_vencimiento, user=None) -> Deuda:
    """Crea la Deuda asociada a un pedido confirmado a crédito."""
    empresa = get_empresa()
    moneda = pedido.moneda or empresa.moneda_base
    tasa = pedido.tasa_cambio or Decimal("1.000000")

    deuda = Deuda(
        cliente=pedido.cliente,
        pedido=pedido,
        moneda=moneda,
        tasa_cambio=tasa,
        monto_original=pedido.total,
        saldo=pedido.total,
        tasa_bcv=pedido.tasa_bcv,
        tasa_bcv_vigente_desde=pedido.tasa_bcv_vigente_desde,
        fecha_emision=pedido.fecha,
        fecha_vencimiento=fecha_vencimiento,
        estado=Deuda.Estado.PENDIENTE,
        created_by=user if user and user.is_authenticated else None,
    )
    deuda.full_clean()
    deuda.save()
    logger.info(
        "Finanzas: deuda %s creada para pedido %s (cliente=%s)",
        deuda.id,
        pedido.numero,
        pedido.cliente.nombre,
    )
    return deuda


@transaction.atomic
def anular_pedido(pedido: Pedido, motivo: str, user=None) -> Pedido:
    """Anula un pedido.

    - Borrador: solo se marca anulado, sin movimientos.
    - Confirmado (no entregado): revierte el stock con movimientos de anulación.
    - Entregado: no se puede anular (requiere Devolución).
    """
    motivo = (motivo or "").strip()
    if not motivo:
        raise BusinessRuleError("Indica el motivo de la anulación.")

    pedido = Pedido.objects.select_for_update().get(pk=pedido.pk)
    if pedido.estado == Pedido.Estado.ANULADO:
        raise BusinessRuleError("El pedido ya está anulado.")
    if pedido.estado == Pedido.Estado.ENTREGADO:
        raise BusinessRuleError("No se puede anular un pedido entregado. Registra una devolución.")

    if pedido.estado == Pedido.Estado.CONFIRMADO:
        for detalle in pedido.detalles.select_related("producto", "combo"):
            if detalle.producto is not None:
                producto = Producto.objects.select_for_update().get(pk=detalle.producto.pk)
                registrar_movimiento(
                    producto,
                    tipo=MovimientoInventario.Tipo.ANULACION,
                    direccion=MovimientoInventario.Direccion.ENTRADA,
                    cantidad=detalle.cantidad,
                    costo_unitario=detalle.costo_unitario,
                    motivo=f"Anulación de pedido {pedido.numero}: {motivo}",
                    referencia_tipo="pedido_anulado",
                    referencia_id=pedido.pk,
                    user=user,
                )
            else:
                combo = detalle.combo
                snapshot = detalle.combo_snapshot or {}
                snapshot_componentes = snapshot.get("componentes", [])

                if snapshot_componentes:
                    componentes_iter = [
                        {
                            "producto_id": c["producto_id"],
                            "cantidad": c["cantidad"],
                        }
                        for c in snapshot_componentes
                    ]
                else:
                    componentes_iter = [
                        {
                            "producto_id": c.producto.pk,
                            "cantidad": str(c.cantidad),
                        }
                        for c in combo.componentes.select_related("producto").all()
                    ]

                for comp in componentes_iter:
                    producto = Producto.objects.select_for_update().get(pk=comp["producto_id"])
                    cantidad_componente = (
                        to_decimal(comp["cantidad"]) * detalle.cantidad
                    ).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
                    registrar_movimiento(
                        producto,
                        tipo=MovimientoInventario.Tipo.ANULACION,
                        direccion=MovimientoInventario.Direccion.ENTRADA,
                        cantidad=cantidad_componente,
                        costo_unitario=producto.costo,
                        motivo=f"Anulación de pedido {pedido.numero} (combo {combo.sku}): {motivo}",
                        referencia_tipo="pedido_anulado",
                        referencia_id=pedido.pk,
                        user=user,
                    )

    # Si existe deuda pendiente vinculada, se anula también.
    if hasattr(pedido, "deuda") and pedido.deuda.estado == Deuda.Estado.PENDIENTE:
        deuda = pedido.deuda
        deuda.estado = Deuda.Estado.ANULADA
        deuda.motivo_anulacion = motivo
        deuda.anulado_por = user if user and user.is_authenticated else None
        deuda.fecha_anulacion = timezone.now()
        deuda.save(
            update_fields=[
                "estado",
                "motivo_anulacion",
                "anulado_por",
                "fecha_anulacion",
                "updated_at",
            ]
        )

    pedido.estado = Pedido.Estado.ANULADO
    pedido.motivo_anulacion = motivo
    pedido.anulado_por = user if user and user.is_authenticated else None
    pedido.fecha_anulacion = timezone.now()
    pedido.save(
        update_fields=[
            "estado",
            "motivo_anulacion",
            "anulado_por",
            "fecha_anulacion",
            "updated_at",
        ]
    )
    logger.info(
        "Pedidos: %s anulado por %s. Motivo: %s",
        pedido.numero,
        getattr(user, "email", "sistema"),
        motivo,
    )
    return pedido


@transaction.atomic
def entregar_pedido(pedido: Pedido, user=None) -> Pedido:
    """Marca el pedido como entregado."""
    pedido = Pedido.objects.select_for_update().get(pk=pedido.pk)
    if pedido.estado != Pedido.Estado.CONFIRMADO:
        raise BusinessRuleError("Solo se pueden entregar pedidos confirmados.")
    pedido.estado = Pedido.Estado.ENTREGADO
    pedido.save(update_fields=["estado", "updated_at"])
    logger.info(
        "Pedidos: %s entregado por %s",
        pedido.numero,
        getattr(user, "email", "sistema"),
    )
    return pedido
