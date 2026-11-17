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
    "numero_cuotas",
    "fecha_primera_cuota",
    "plan_cuotas",
    "descuento",
    "otros_montos",
    "numero_referencia",
    "notas",
)

TWO_PLACES = Decimal("0.01")


def _parse_fecha_cuota(valor):
    if valor in (None, ""):
        return None
    if hasattr(valor, "year") and hasattr(valor, "month") and hasattr(valor, "day"):
        return valor
    from datetime import date

    try:
        return date.fromisoformat(str(valor))
    except Exception as exc:
        raise BusinessRuleError("La fecha de la cuota no es válida.") from exc


def _normalizar_plan_cuotas(
    tipo_pago: str,
    numero_cuotas,
    fecha_primera_cuota,
    plan_cuotas,
    total: Decimal,
    fecha_pedido,
) -> tuple[int, object, list[dict]]:
    """Normaliza el plan de cuotas para pedidos a crédito.

    - Semanal desde la fecha de la primera cuota (si no se indican fechas por cuota).
    - Montos en moneda del pedido/documento.
    - Ajuste automático del residuo en la última cuota para cuadrar con el total.
    """
    if tipo_pago != Pedido.TipoPago.CREDITO:
        return 1, None, []

    try:
        n = int(numero_cuotas or 1)
    except (TypeError, ValueError):
        n = 1
    n = max(1, min(10, n))

    total = money(total)
    fecha_base = _parse_fecha_cuota(fecha_primera_cuota) or fecha_pedido

    entradas = plan_cuotas if isinstance(plan_cuotas, list) else []
    if entradas and len(entradas) != n:
        # Si el usuario cambió la cantidad, regeneramos base y conservamos montos/fechas donde aplique.
        pass

    montos = []
    fechas = []
    for i in range(n):
        entrada = entradas[i] if i < len(entradas) else {}
        monto_raw = entrada.get("monto") if isinstance(entrada, dict) else None
        fecha_raw = entrada.get("fecha_vencimiento") if isinstance(entrada, dict) else None
        if monto_raw in (None, ""):
            montos.append(None)
        else:
            montos.append(money(monto_raw))
        fecha = _parse_fecha_cuota(fecha_raw) if fecha_raw not in (None, "") else None
        if fecha is None:
            from datetime import timedelta

            fecha = fecha_base + timedelta(days=7 * i)
        fechas.append(fecha)

    # Si el plan recibido trae montos explícitos pero todos en cero (p.ej. por
    # un error de cálculo/conversión en el cliente), se regenera distribución
    # equitativa en lugar de dejar todas las cuotas en 0 salvo la última.
    montos_explicitos = [m for m in montos if m is not None]
    if montos_explicitos and total > 0 and sum(montos_explicitos, Decimal("0.00")) <= Decimal("0.00"):
        montos = [None] * n

    base = (to_decimal(total) / Decimal(n)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    normalizados = []
    acumulado = Decimal("0.00")
    for i in range(n):
        if i == n - 1:
            monto = money(to_decimal(total) - acumulado)
        else:
            monto = montos[i] if montos[i] is not None else base
            if monto < 0:
                monto = Decimal("0.00")
            # Ajuste automático para no exceder el total disponible.
            restante_despues = money(to_decimal(total) - acumulado - monto)
            minimo_restante = Decimal("0.00")
            if restante_despues < minimo_restante and n - i - 1 > 0:
                monto = money(to_decimal(total) - acumulado)
            acumulado = money(acumulado + monto)
        if i == n - 1:
            acumulado = money(acumulado + monto)
        normalizados.append(
            {
                "numero": i + 1,
                "fecha_vencimiento": fechas[i].isoformat(),
                "monto": str(money(monto)),
            }
        )

    # Ajuste automático final por redondeos/ediciones.
    suma = sum((money(item["monto"]) for item in normalizados), Decimal("0.00"))
    diff = money(total - suma)
    if diff != Decimal("0.00") and normalizados:
        ultimo = money(money(normalizados[-1]["monto"]) + diff)
        if ultimo < 0:
            # Redistribuir si el último quedara negativo por sobreajuste manual.
            exceso = money(-ultimo)
            normalizados[-1]["monto"] = "0.00"
            for j in range(len(normalizados) - 2, -1, -1):
                if exceso <= 0:
                    break
                actual = money(normalizados[j]["monto"])
                rebaja = actual if actual <= exceso else exceso
                normalizados[j]["monto"] = str(money(actual - rebaja))
                exceso = money(exceso - rebaja)
            suma = sum((money(item["monto"]) for item in normalizados), Decimal("0.00"))
            diff = money(total - suma)
            if diff != Decimal("0.00"):
                idx = max(range(len(normalizados)), key=lambda k: money(normalizados[k]["monto"]))
                normalizados[idx]["monto"] = str(money(money(normalizados[idx]["monto"]) + diff))
        else:
            normalizados[-1]["monto"] = str(ultimo)

    return n, fecha_base, normalizados


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

    # Fecha del pedido: se trata individualmente y se guarda tal cual viene del formulario (campo "Fecha *").
    # Solo si no se envía, se usa la fecha actual como respaldo.
    if "fecha" in data and data.get("fecha") is not None:
        fecha = data["fecha"]
    else:
        fecha = timezone.localdate()
    datos["fecha"] = fecha

    moneda = (datos.get("moneda") or empresa.moneda_base or "USD").upper()
    tasa = _resolver_tasa(moneda, datos.get("tasa_cambio"), empresa, fecha)
    otros_montos = money(to_decimal(datos.get("otros_montos", 0)))
    if otros_montos < 0:
        raise BusinessRuleError("Los otros montos no pueden ser negativos.")
    datos["otros_montos"] = otros_montos
    if "numero_referencia" in datos and datos["numero_referencia"] is not None:
        datos["numero_referencia"] = str(datos["numero_referencia"]).strip()

    tipo_pago = datos.get("tipo_pago") or Pedido.TipoPago.CONTADO

    descuento_global = money(to_decimal(datos.get("descuento", 0)))
    if descuento_global < 0:
        raise BusinessRuleError("El descuento global no puede ser negativo.")

    normalizados = _normalizar_detalles(detalles, empresa.iva_rate)

    subtotal = Decimal("0.00")
    iva_total = Decimal("0.00")
    descuento_lineas = Decimal("0.00")
    for detalle in normalizados:
        subtotal += detalle["subtotal"]
        iva_total += detalle["iva_linea"]
        descuento_lineas += detalle["descuento_linea"]

    subtotal = money(subtotal)
    iva_total = money(iva_total)
    descuento_lineas = money(descuento_lineas)
    descuento_total = money(descuento_lineas + descuento_global)
    total = money(subtotal + iva_total + otros_montos - descuento_global)
    if total < 0:
        total = Decimal("0.00")

    if tipo_pago == Pedido.TipoPago.CONTADO:
        numero_cuotas = 1
        fecha_primera_cuota = None
        plan_cuotas = []
    else:
        numero_cuotas, fecha_primera_cuota, plan_cuotas = _normalizar_plan_cuotas(
            tipo_pago,
            datos.get("numero_cuotas"),
            datos.get("fecha_primera_cuota"),
            datos.get("plan_cuotas"),
            total,
            fecha,
        )
    datos["tipo_pago"] = tipo_pago
    datos["numero_cuotas"] = numero_cuotas
    datos["fecha_primera_cuota"] = fecha_primera_cuota
    datos["plan_cuotas"] = plan_cuotas

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

    numero = siguiente_numero("pedido", "PED", fecha.year)

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


def _sincronizar_deuda_contado_borrador(pedido: Pedido, deuda: Deuda, user=None) -> Deuda:
    """Actualiza la deuda de un pedido contado en borrador para que refleje el pedido.

    Solo sincroniza si no hay pagos aplicados (ni anulados con efecto neto distinto de
    cero). Si la deuda ya tiene aplicaciones vigentes, no se altera: el monto cobrado
    debe seguir siendo consistente con lo registrado.
    """
    from apps.finances.models import PagoAplicacion
    from apps.finances.services import crear_plan_cuotas

    deuda = Deuda.objects.select_for_update().get(pk=deuda.pk)
    if deuda.estado == Deuda.Estado.ANULADA:
        return deuda

    tiene_aplicaciones = PagoAplicacion.objects.filter(deuda=deuda, pago__anulado=False).exists()
    if tiene_aplicaciones or deuda.saldo != deuda.monto_original:
        if (
            deuda.moneda != (pedido.moneda or deuda.moneda)
            or money(deuda.monto_original) != money(pedido.total)
            or to_decimal(deuda.tasa_cambio) != to_decimal(pedido.tasa_cambio)
        ):
            logger.warning(
                "Pedidos: deuda %s del pedido contado %s difiere del pedido pero tiene pagos/aplicaciones; no se sincroniza.",
                deuda.id,
                pedido.numero,
            )
        return deuda

    moneda = pedido.moneda or deuda.moneda
    tasa = pedido.tasa_cambio or Decimal("1.000000")
    total = money(pedido.total)
    campos_update = []
    if deuda.cliente_id != pedido.cliente_id:
        deuda.cliente = pedido.cliente
        campos_update.append("cliente")
    if deuda.moneda != moneda:
        deuda.moneda = moneda
        campos_update.append("moneda")
    if to_decimal(deuda.tasa_cambio) != to_decimal(tasa):
        deuda.tasa_cambio = tasa
        campos_update.append("tasa_cambio")
    if money(deuda.monto_original) != total:
        deuda.monto_original = total
        campos_update.append("monto_original")
    if money(deuda.saldo) != total:
        deuda.saldo = total
        campos_update.append("saldo")
    if deuda.tasa_bcv != pedido.tasa_bcv:
        deuda.tasa_bcv = pedido.tasa_bcv
        campos_update.append("tasa_bcv")
    if deuda.tasa_bcv_vigente_desde != pedido.tasa_bcv_vigente_desde:
        deuda.tasa_bcv_vigente_desde = pedido.tasa_bcv_vigente_desde
        campos_update.append("tasa_bcv_vigente_desde")
    if deuda.fecha_emision != pedido.fecha:
        deuda.fecha_emision = pedido.fecha
        campos_update.append("fecha_emision")
    if deuda.fecha_vencimiento is not None:
        deuda.fecha_vencimiento = None
        campos_update.append("fecha_vencimiento")
    if deuda.estado != Deuda.Estado.PENDIENTE:
        deuda.estado = Deuda.Estado.PENDIENTE
        campos_update.append("estado")
    if campos_update:
        deuda.save(update_fields=[*campos_update, "updated_at"])

    cuota = deuda.cuotas.order_by("numero").first()
    fecha_cuota = pedido.fecha + timezone.timedelta(days=30)
    if cuota is None:
        crear_plan_cuotas(deuda, numero_cuotas=1, fecha_base=pedido.fecha, user=user)
    else:
        cuota_campos = []
        if money(cuota.monto) != total:
            cuota.monto = total
            cuota_campos.append("monto")
        if money(cuota.saldo) != total:
            cuota.saldo = total
            cuota_campos.append("saldo")
        if cuota.fecha_vencimiento != fecha_cuota:
            cuota.fecha_vencimiento = fecha_cuota
            cuota_campos.append("fecha_vencimiento")
        if cuota.estado != cuota.__class__.Estado.PENDIENTE:
            cuota.estado = cuota.__class__.Estado.PENDIENTE
            cuota_campos.append("estado")
        if cuota_campos:
            cuota.save(update_fields=[*cuota_campos, "updated_at"])
        if deuda.fecha_vencimiento != cuota.fecha_vencimiento:
            deuda.fecha_vencimiento = cuota.fecha_vencimiento
            deuda.save(update_fields=["fecha_vencimiento", "updated_at"])

    deuda.refresh_from_db()
    return deuda


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

    # Fecha del pedido: se trata individualmente y se guarda tal cual viene del formulario (campo "Fecha *").
    # Si no se envía en la actualización, se conserva la fecha ya registrada del pedido.
    if "fecha" in data and data.get("fecha") is not None:
        fecha = data["fecha"]
    else:
        fecha = pedido.fecha
    datos["fecha"] = fecha

    moneda = (datos.get("moneda") or pedido.moneda or empresa.moneda_base or "USD").upper()
    if "tasa_cambio" in data:
        tasa = _resolver_tasa(moneda, datos.get("tasa_cambio"), empresa, fecha)
    else:
        tasa = pedido.tasa_cambio

    otros_montos = money(to_decimal(datos.get("otros_montos", pedido.otros_montos)))
    if otros_montos < 0:
        raise BusinessRuleError("Los otros montos no pueden ser negativos.")
    datos["otros_montos"] = otros_montos
    if "numero_referencia" in datos and datos["numero_referencia"] is not None:
        datos["numero_referencia"] = str(datos["numero_referencia"]).strip()

    tipo_pago = datos.get("tipo_pago") or pedido.tipo_pago

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

    descuento_global = money(to_decimal(datos.get("descuento", pedido.descuento)))
    # `pedido.descuento` almacenado puede incluir descuentos de línea + global;
    # si no se envía descuento, conservamos 0 como global adicional para no re-restar.
    if "descuento" not in data:
        descuento_global = Decimal("0.00")
    if descuento_global < 0:
        raise BusinessRuleError("El descuento global no puede ser negativo.")

    normalizados = _normalizar_detalles(detalles, empresa.iva_rate)

    subtotal = Decimal("0.00")
    iva_total = Decimal("0.00")
    descuento_lineas = Decimal("0.00")
    for d in normalizados:
        subtotal += d["subtotal"]
        iva_total += d["iva_linea"]
        descuento_lineas += d["descuento_linea"]

    subtotal = money(subtotal)
    iva_total = money(iva_total)
    descuento_lineas = money(descuento_lineas)
    descuento_total = money(descuento_lineas + descuento_global)
    total = money(subtotal + iva_total + otros_montos - descuento_global)
    if total < 0:
        total = Decimal("0.00")

    if tipo_pago == Pedido.TipoPago.CONTADO:
        numero_cuotas = 1
        fecha_primera_cuota = None
        plan_cuotas = []
    else:
        plan_fuente = datos["plan_cuotas"] if "plan_cuotas" in datos else (pedido.plan_cuotas or [])
        fecha_primera_fuente = (
            datos["fecha_primera_cuota"]
            if "fecha_primera_cuota" in datos
            else pedido.fecha_primera_cuota
        )
        numero_cuotas, fecha_primera_cuota, plan_cuotas = _normalizar_plan_cuotas(
            tipo_pago,
            datos.get("numero_cuotas", pedido.numero_cuotas),
            fecha_primera_fuente,
            plan_fuente,
            total,
            fecha,
        )
    datos["tipo_pago"] = tipo_pago
    datos["numero_cuotas"] = numero_cuotas
    datos["fecha_primera_cuota"] = fecha_primera_cuota
    datos["plan_cuotas"] = plan_cuotas

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

    if pedido.tipo_pago == Pedido.TipoPago.CONTADO:
        try:
            deuda = Deuda.objects.select_for_update().get(pedido=pedido)
        except Deuda.DoesNotExist:
            deuda = None
        if deuda is not None:
            _sincronizar_deuda_contado_borrador(pedido, deuda, user=user)
    elif hasattr(pedido, "deuda"):
        # Si cambió a crédito u otro estado incompatible con deuda de contado borrador,
        # no se elimina automáticamente; la confirmación/cobro debe manejarse explícitamente.
        pass

    logger.info("Pedidos: %s actualizado por %s", pedido.numero, getattr(user, "email", "sistema"))
    return pedido


@transaction.atomic
def asegurar_deuda_contado_borrador(pedido: Pedido, user=None) -> Deuda:
    """Crea (si no existe) la deuda para un pedido de contado en borrador (flujo 2b).

    Si la deuda ya existe y no tiene pagos aplicados, se sincroniza con los datos
    actuales del pedido para evitar que el modal de cobro muestre montos/moneda/tasa
    desactualizados.
    """
    pedido = Pedido.objects.select_for_update().get(pk=pedido.pk)
    if pedido.estado != Pedido.Estado.BORRADOR:
        raise BusinessRuleError("Solo se puede preparar el cobro de pedidos en borrador.")
    if pedido.tipo_pago != Pedido.TipoPago.CONTADO:
        raise BusinessRuleError("Este pedido no es de contado.")
    try:
        deuda = pedido.deuda
    except Deuda.DoesNotExist:
        deuda = None
    if deuda is not None:
        return _sincronizar_deuda_contado_borrador(pedido, deuda, user=user)

    empresa = get_empresa()
    if empresa is None:
        raise BusinessRuleError("Primero configura los datos fiscales de la empresa.")
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
        fecha_vencimiento=None,
        estado=Deuda.Estado.PENDIENTE,
        created_by=user if user and user.is_authenticated else None,
    )
    deuda.full_clean()
    deuda.save()
    from apps.finances.services import crear_plan_cuotas

    crear_plan_cuotas(deuda, numero_cuotas=1, fecha_base=pedido.fecha, user=user)
    deuda.refresh_from_db()
    logger.info(
        "Finanzas: deuda %s creada para cobro previo de pedido contado %s",
        deuda.id,
        pedido.numero,
    )
    return deuda


@transaction.atomic
def confirmar_pedido(
    pedido: Pedido,
    numero_cuotas: int = 1,
    fecha_vencimiento=None,
    fecha_primera_cuota=None,
    plan_cuotas=None,
    user=None,
) -> Pedido:
    """Confirma el pedido: descuenta stock y gestiona deuda según tipo de pago."""
    pedido = Pedido.objects.select_for_update().get(pk=pedido.pk)
    if pedido.estado != Pedido.Estado.BORRADOR:
        raise BusinessRuleError("Solo se pueden confirmar pedidos en borrador.")

    empresa = get_empresa()
    if empresa is None:
        raise BusinessRuleError("Primero configura los datos fiscales de la empresa.")

    if pedido.tipo_pago == Pedido.TipoPago.CONTADO:
        try:
            deuda = pedido.deuda
        except Deuda.DoesNotExist:
            deuda = None
        if deuda is None:
            raise BusinessRuleError(
                "Para pedidos de contado debes registrar el pago "
                "(Deudas y Cobros) antes de confirmar."
            )
        if deuda.estado != Deuda.Estado.PAGADA or deuda.saldo > Decimal("0.00"):
            raise BusinessRuleError(
                "El pedido de contado debe estar pagado en su totalidad antes de confirmar."
            )
    else:
        plan_fuente = plan_cuotas if plan_cuotas is not None else (pedido.plan_cuotas or [])
        fecha_primera_fuente = (
            fecha_primera_cuota
            if fecha_primera_cuota is not None
            else pedido.fecha_primera_cuota
        )
        n_cuotas_norm, fecha_primera_norm, plan_norm = _normalizar_plan_cuotas(
            pedido.tipo_pago,
            numero_cuotas if numero_cuotas is not None else pedido.numero_cuotas,
            fecha_primera_fuente,
            plan_fuente,
            pedido.total,
            pedido.fecha,
        )
        pedido.numero_cuotas = n_cuotas_norm
        pedido.fecha_primera_cuota = fecha_primera_norm
        pedido.plan_cuotas = plan_norm
        pedido.save(
            update_fields=["numero_cuotas", "fecha_primera_cuota", "plan_cuotas", "updated_at"]
        )

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
        _crear_deuda_desde_pedido(
            pedido,
            fecha_vencimiento,
            numero_cuotas=pedido.numero_cuotas,
            user=user,
        )

    logger.info(
        "Pedidos: %s confirmado por %s (tipo_pago=%s)",
        pedido.numero,
        getattr(user, "email", "sistema"),
        pedido.tipo_pago,
    )
    return pedido


def _crear_deuda_desde_pedido(
    pedido: Pedido, fecha_vencimiento, numero_cuotas: int = 1, user=None
) -> Deuda:
    """Crea la Deuda asociada a un pedido confirmado a crédito y su plan de cuotas."""
    from apps.finances.services import crear_plan_cuotas

    existente = Deuda.objects.filter(pedido=pedido).first()
    if existente is not None:
        raise BusinessRuleError(
            "Este pedido ya tiene una deuda registrada. Revisa el cobro asociado antes de confirmar."
        )

    empresa = get_empresa()
    moneda = pedido.moneda or empresa.moneda_base
    tasa = pedido.tasa_cambio or Decimal("1.000000")

    plan = (
        pedido.plan_cuotas
        if isinstance(pedido.plan_cuotas, list) and pedido.plan_cuotas
        else None
    )
    fecha_base = pedido.fecha_primera_cuota or pedido.fecha

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

    crear_plan_cuotas(
        deuda,
        numero_cuotas=numero_cuotas or pedido.numero_cuotas or 1,
        fecha_base=fecha_base,
        periodicidad_dias=7,
        user=user,
        plan=plan,
    )
    deuda.refresh_from_db()

    logger.info(
        "Finanzas: deuda %s creada para pedido %s (cliente=%s, cuotas=%s)",
        deuda.id,
        pedido.numero,
        pedido.cliente.nombre,
        numero_cuotas or pedido.numero_cuotas,
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
@transaction.atomic
def entregar_pedido(pedido: Pedido, user=None) -> Pedido:
    """Marca el pedido como entregado."""
    pedido = (
        Pedido.objects.select_for_update()
        .select_related("cliente")
        .get(pk=pedido.pk)
    )
    if pedido.estado != Pedido.Estado.CONFIRMADO:
        raise BusinessRuleError("Solo se pueden entregar pedidos confirmados.")

    # Para ventas de contado, la cobranza debe registrarse antes de la entrega.
    if pedido.tipo_pago == Pedido.TipoPago.CONTADO:
        from apps.finances.models import Deuda

        try:
            deuda = Deuda.objects.select_for_update().get(pedido=pedido)
        except Deuda.DoesNotExist as exc:
            raise BusinessRuleError(
                "Debes registrar la cobranza del pedido de contado antes de entregarlo."
            ) from exc
        if deuda.estado != Deuda.Estado.PAGADA or money(deuda.saldo) > Decimal("0.00"):
            raise BusinessRuleError(
                "Debes registrar la cobranza completa del pedido de contado antes de entregarlo."
            )

    pedido.estado = Pedido.Estado.ENTREGADO
    pedido.save(update_fields=["estado", "updated_at"])
    logger.info(
        "Pedidos: %s entregado por %s",
        pedido.numero,
        getattr(user, "email", "sistema"),
    )
    return pedido
