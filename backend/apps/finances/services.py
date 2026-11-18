"""Servicios financieros: cuotas, pagos, caja y consultas de deudores."""

import logging
from calendar import monthrange
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.common.exceptions import BusinessRuleError
from apps.common.sequences import siguiente_numero
from apps.common.utils.money import money, to_base, to_decimal
from apps.common.utils.phone import normalize_phone
from apps.company.services import get_empresa

from .models import CajaSesion, Cuota, Deuda, MovimientoCaja, Pago, PagoAplicacion

logger = logging.getLogger("auditoria")

TWO = Decimal("0.01")
BS_TOLERANCE = Decimal("0.05")  # tolerancia por redondeo en validación Bs


def _validar(instance):
    try:
        instance.full_clean()
    except DjangoValidationError as exc:
        msgs = []
        for v in exc.message_dict.values() if hasattr(exc, "message_dict") else [exc.messages]:
            msgs.extend(v if isinstance(v, (list, tuple)) else [v])
        raise BusinessRuleError("; ".join(str(m) for m in msgs) or "Datos inválidos.") from exc


def _add_months(fecha: date, months: int) -> date:
    month = fecha.month - 1 + months
    year = fecha.year + month // 12
    month = month % 12 + 1
    day = min(fecha.day, monthrange(year, month)[1])
    return date(year, month, day)


@transaction.atomic
def crear_plan_cuotas(
    deuda: Deuda,
    numero_cuotas: int = 1,
    fecha_base: date | None = None,
    periodicidad_dias: int | None = 30,
    user=None,
    plan=None,
) -> list[Cuota]:
    """Crea el plan de cuotas para una deuda (1..10). Idempotente si ya existen.

    Si `plan` se indica, se usa como fuente (lista de {numero, fecha_vencimiento, monto})
    y se ajusta automáticamente para cuadrar con `deuda.monto_original`.
    """
    if deuda.cuotas.exists():
        return list(deuda.cuotas.order_by("numero"))

    total = money(deuda.monto_original)
    base_fecha = fecha_base or deuda.fecha_emision or timezone.localdate()

    if plan:
        entradas = [p for p in plan if isinstance(p, dict)]
        n = len(entradas) or int(numero_cuotas or 1)
    else:
        entradas = []
        try:
            n = int(numero_cuotas)
        except (TypeError, ValueError):
            n = 1
    if n < 1 or n > 10:
        raise BusinessRuleError("El número de cuotas debe estar entre 1 y 10.")

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
        if fecha_raw in (None, ""):
            if periodicidad_dias:
                venc = base_fecha + timedelta(days=periodicidad_dias * (i + 1))
            else:
                venc = _add_months(base_fecha, i + 1)
        else:
            try:
                venc = date.fromisoformat(str(fecha_raw))
            except Exception as exc:
                raise BusinessRuleError("La fecha de vencimiento de una cuota no es válida.") from exc
        fechas.append(venc)

    montos_explicitos = [m for m in montos if m is not None]
    if montos_explicitos and total > 0 and sum(montos_explicitos, Decimal("0.00")) <= Decimal("0.00"):
        montos = [None] * n

    base_monto = (to_decimal(total) / Decimal(n)).quantize(TWO, rounding=ROUND_HALF_UP)
    calculados = []
    acumulado = Decimal("0.00")
    for i in range(n):
        if i == n - 1:
            monto = money(to_decimal(total) - acumulado)
        else:
            monto = montos[i] if montos[i] is not None else base_monto
            if monto < 0:
                monto = Decimal("0.00")
            monto = money(monto)
            acumulado = money(acumulado + monto)
        calculados.append(monto)

    suma = sum(calculados, Decimal("0.00"))
    diff = money(total - suma)
    if diff != Decimal("0.00") and calculados:
        ajustado = money(calculados[-1] + diff)
        if ajustado < 0:
            calculados[-1] = Decimal("0.00")
            suma = sum(calculados, Decimal("0.00"))
            diff = money(total - suma)
            idx = max(range(len(calculados)), key=lambda k: calculados[k])
            calculados[idx] = money(calculados[idx] + diff)
        else:
            calculados[-1] = ajustado

    if any(m < 0 for m in calculados):
        raise BusinessRuleError("No se pudo distribuir el monto en cuotas.")

    cuotas = []
    for i in range(1, n + 1):
        cuota = Cuota(
            deuda=deuda,
            numero=i,
            monto=calculados[i - 1],
            saldo=calculados[i - 1],
            fecha_vencimiento=fechas[i - 1],
            estado=Cuota.Estado.PENDIENTE,
            created_by=user if user and getattr(user, "is_authenticated", False) else None,
        )
        _validar(cuota)
        cuotas.append(cuota)
    Cuota.objects.bulk_create(cuotas)

    if cuotas:
        deuda.fecha_vencimiento = cuotas[-1].fecha_vencimiento
        deuda.save(update_fields=["fecha_vencimiento", "updated_at"])
    logger.info("Finanzas: plan de %s cuota(s) creado para deuda %s", n, deuda.id)
    return cuotas


def asegurar_cuotas(deuda: Deuda, user=None) -> list[Cuota]:
    if not deuda.cuotas.exists():
        return crear_plan_cuotas(deuda, 1, user=user)
    return list(deuda.cuotas.order_by("numero"))


def _aplicar_a_cuotas(pago: Pago, deuda: Deuda, monto_aplicar: Decimal, user=None):
    """Aplica monto a cuotas pendientes más antiguas. Retorna lista de PagoAplicacion."""
    asegurar_cuotas(deuda, user=user)
    restante = money(monto_aplicar)
    aplicaciones = []
    cuotas = list(
        Cuota.objects.select_for_update().filter(deuda=deuda, saldo__gt=0).order_by("numero", "id")
    )
    for cuota in cuotas:
        if restante <= 0:
            break
        aplicar = cuota.saldo if cuota.saldo <= restante else restante
        aplicar = money(aplicar)
        if aplicar <= 0:
            continue
        cuota.saldo = money(cuota.saldo - aplicar)
        cuota.actualizar_estado()
        cuota.save(update_fields=["saldo", "estado", "updated_at"])
        app = PagoAplicacion(pago=pago, deuda=deuda, cuota=cuota, monto=aplicar)
        _validar(app)
        aplicaciones.append(app)
        restante = money(restante - aplicar)
    if restante > Decimal("0.00"):
        # Saldo a favor: se registra como aplicación a deuda sin cuota (anticipo)
        app = PagoAplicacion(pago=pago, deuda=deuda, cuota=None, monto=restante)
        _validar(app)
        aplicaciones.append(app)
        restante = Decimal("0.00")
    PagoAplicacion.objects.bulk_create(aplicaciones)
    return aplicaciones


def saldos_en_bs_y_divisa(saldo, moneda: str, tasa_cambio) -> tuple[Decimal, Decimal]:
    """Devuelve ``(saldo_bs, saldo_base)`` para un saldo en la moneda del documento.

    - Documento en bolívares: la tasa son Bs por 1 divisa, así que el saldo en
      la divisa de la tasa es ``saldo / tasa``.
    - Documento en divisa: el saldo ya está en la divisa y su equivalente en Bs
      es ``saldo * tasa``.
    """
    monto = money(saldo)
    tasa = to_decimal(tasa_cambio)
    if (moneda or "").upper() == "VES":
        base = money(monto / tasa) if tasa > 0 else Decimal("0.00")
        return monto, base
    en_bs = money(monto * tasa) if tasa > 0 else Decimal("0.00")
    return en_bs, monto


def _recalcular_deuda(deuda: Deuda):
    deuda = Deuda.objects.select_for_update().get(pk=deuda.pk)
    if deuda.estado == Deuda.Estado.ANULADA:
        return deuda
    pagado = PagoAplicacion.objects.filter(deuda=deuda, pago__anulado=False).aggregate(
        s=Sum("monto")
    )["s"] or Decimal("0.00")
    saldo = money(to_decimal(deuda.monto_original) - to_decimal(pagado))
    if saldo < 0:
        saldo = Decimal("0.00")
    deuda.saldo = saldo
    deuda.saldo_bs, deuda.saldo_base = saldos_en_bs_y_divisa(
        saldo, deuda.moneda, deuda.tasa_cambio
    )
    deuda.estado = Deuda.Estado.PAGADA if saldo <= 0 else Deuda.Estado.PENDIENTE
    deuda.save(update_fields=["saldo", "saldo_bs", "saldo_base", "estado", "updated_at"])
    return deuda


@transaction.atomic
def registrar_pago(data: dict, user=None) -> Pago:
    """Registra un pago, lo aplica a cuotas (más antiguas primero) y mueve caja si es efectivo."""
    empresa = get_empresa()
    if empresa is None:
        raise BusinessRuleError("Primero configura los datos fiscales de la empresa.")

    cliente = data.get("cliente")
    deuda = data.get("deuda")
    if deuda is None:
        raise BusinessRuleError("Debes indicar la deuda a pagar.")
    deuda = Deuda.objects.select_for_update().select_related("cliente", "pedido").get(pk=deuda.pk)
    if deuda.estado == Deuda.Estado.ANULADA:
        raise BusinessRuleError("No se puede registrar un pago sobre una deuda anulada.")
    if deuda.saldo <= 0:
        raise BusinessRuleError("La deuda no tiene saldo pendiente.")

    if cliente and cliente.pk != deuda.cliente_id:
        raise BusinessRuleError("El cliente del pago no coincide con el de la deuda.")

    moneda = (data.get("moneda") or deuda.moneda or empresa.moneda_base or "USD").upper()
    tasa_cambio = to_decimal(data.get("tasa_cambio") or deuda.tasa_cambio or Decimal("1"))
    if tasa_cambio <= 0:
        raise BusinessRuleError("La tasa de cambio debe ser mayor que cero.")

    monto = money(data.get("monto"))
    if monto <= 0:
        raise BusinessRuleError("El monto del pago debe ser mayor que cero.")

    metodo = data.get("metodo")
    if metodo not in Pago.Metodo.values:
        raise BusinessRuleError("Método de pago inválido.")

    # Caja: si es efectivo, se asocia a la sesión abierta cuando exista.
    # Si no hay caja abierta, el pago se registra igual y queda fuera del arqueo.
    caja_sesion = data.get("caja_sesion")
    if metodo == Pago.Metodo.EFECTIVO:
        if caja_sesion is None:
            caja_sesion = (
                CajaSesion.objects.select_for_update()
                .filter(estado=CajaSesion.Estado.ABIERTA, usuario_apertura=user)
                .order_by("-fecha_apertura")
                .first()
            )
        elif caja_sesion.estado != CajaSesion.Estado.ABIERTA:
            raise BusinessRuleError("La sesión de caja indicada no está abierta.")
    else:
        caja_sesion = None

    telefono_origen = (
        normalize_phone(data.get("telefono_origen", "")) if data.get("telefono_origen") else ""
    )
    monto_recibido_bs = data.get("monto_recibido_bs")
    tasa_usada_bs = data.get("tasa_usada_bs")
    if monto_recibido_bs is not None:
        monto_recibido_bs = money(monto_recibido_bs)
    if tasa_usada_bs is not None:
        tasa_usada_bs = to_decimal(tasa_usada_bs)

    # Nota: no se bloquea por diferencia de cálculo Bs/tasa (la tasa puede ajustarse manualmente).
    # Se conserva el monto recibido y la tasa usada informados para referencia/auditoría.

    aplicar_completo = bool(data.get("aplicar_completo"))
    # Por defecto el monto aplicado es el del pago (limitado al saldo).
    # Si la tasa de cobro se ajusta manualmente, se imputa como pago completo
    # (aplicación = monto indicado, p.ej. saldo de la cuota), aunque el Bs recibido difiera.
    monto_aplicar = monto if monto <= deuda.saldo else money(deuda.saldo)

    monto_base = to_base(monto, tasa_cambio) if moneda != empresa.moneda_base else money(monto)

    numero = siguiente_numero("pago", "PAG", timezone.localdate().year)
    pago = Pago(
        numero=numero,
        cliente=deuda.cliente,
        fecha_pago=data.get("fecha_pago") or timezone.localdate(),
        moneda=moneda,
        tasa_cambio=tasa_cambio,
        monto=monto,
        monto_base=monto_base,
        metodo=metodo,
        referencia=(data.get("referencia") or "").strip(),
        banco=(data.get("banco") or "").strip(),
        telefono_origen=telefono_origen,
        monto_recibido_bs=monto_recibido_bs,
        tasa_usada_bs=tasa_usada_bs,
        nota=(data.get("nota") or "").strip(),
        caja_sesion=caja_sesion,
        created_by=user if user and getattr(user, "is_authenticated", False) else None,
    )
    _validar(pago)
    pago.save()

    _aplicar_a_cuotas(pago, deuda, monto_aplicar, user=user)
    _recalcular_deuda(deuda)

    # Movimiento de caja para efectivo
    if metodo == Pago.Metodo.EFECTIVO and caja_sesion is not None:
        mov = MovimientoCaja(
            caja_sesion=caja_sesion,
            tipo=MovimientoCaja.Tipo.INGRESO,
            concepto=f"Cobro {pago.numero} - {deuda.pedido.numero}",
            monto=monto,
            moneda=moneda,
            tasa_cambio=tasa_cambio,
            monto_base=monto_base,
            metodo=metodo,
            referencia_tipo="pago",
            referencia_id=pago.pk,
            es_efectivo=True,
            created_by=user if user and getattr(user, "is_authenticated", False) else None,
        )
        _validar(mov)
        mov.save()

    logger.info(
        "Finanzas: pago %s registrado por %s para deuda %s monto %s %s",
        pago.numero,
        getattr(user, "email", "sistema"),
        deuda.id,
        monto,
        moneda,
    )
    return pago


@transaction.atomic
def anular_pago(pago: Pago, motivo: str, user=None) -> Pago:
    motivo = (motivo or "").strip()
    if not motivo:
        raise BusinessRuleError("Indica el motivo de la anulación.")
    pago = Pago.objects.select_for_update().get(pk=pago.pk)
    if pago.anulado:
        raise BusinessRuleError("El pago ya está anulado.")

    # Revertir aplicaciones y saldos de cuotas/deudas
    aplicaciones = list(pago.aplicaciones.select_related("deuda", "cuota"))
    deudas_ids = set()
    for app in aplicaciones:
        deudas_ids.add(app.deuda_id)
        if app.cuota_id:
            cuota = Cuota.objects.select_for_update().get(pk=app.cuota_id)
            cuota.saldo = money(cuota.saldo + app.monto)
            if cuota.saldo > cuota.monto:
                cuota.saldo = cuota.monto
            cuota.actualizar_estado()
            cuota.save(update_fields=["saldo", "estado", "updated_at"])

    for did in deudas_ids:
        _recalcular_deuda(Deuda.objects.get(pk=did))

    # Reverso en caja si hubo movimiento de efectivo
    if pago.caja_sesion_id and pago.metodo == Pago.Metodo.EFECTIVO:
        sesion = CajaSesion.objects.select_for_update().get(pk=pago.caja_sesion_id)
        if sesion.estado == CajaSesion.Estado.CERRADA:
            raise BusinessRuleError(
                "No se puede anular un pago en efectivo de una caja ya cerrada."
            )
        mov = MovimientoCaja(
            caja_sesion=sesion,
            tipo=MovimientoCaja.Tipo.EGRESO,
            concepto=f"Anulación cobro {pago.numero}: {motivo}",
            monto=pago.monto,
            moneda=pago.moneda,
            tasa_cambio=pago.tasa_cambio,
            monto_base=pago.monto_base,
            metodo=pago.metodo,
            referencia_tipo="pago_anulado",
            referencia_id=pago.pk,
            es_efectivo=True,
            created_by=user if user and getattr(user, "is_authenticated", False) else None,
        )
        _validar(mov)
        mov.save()

    pago.anulado = True
    pago.motivo_anulacion = motivo
    pago.anulado_por = user if user and getattr(user, "is_authenticated", False) else None
    pago.fecha_anulacion = timezone.now()
    pago.save(
        update_fields=[
            "anulado",
            "motivo_anulacion",
            "anulado_por",
            "fecha_anulacion",
            "updated_at",
        ]
    )
    logger.info(
        "Finanzas: pago %s anulado por %s. Motivo: %s",
        pago.numero,
        getattr(user, "email", "sistema"),
        motivo,
    )
    return pago


# --- Caja ---


def get_caja_abierta(usuario):
    if not usuario or not getattr(usuario, "is_authenticated", False):
        return None
    return (
        CajaSesion.objects.filter(estado=CajaSesion.Estado.ABIERTA, usuario_apertura=usuario)
        .order_by("-fecha_apertura")
        .first()
    )


@transaction.atomic
def abrir_caja(data: dict, user) -> CajaSesion:
    if get_caja_abierta(user):
        raise BusinessRuleError("Ya tienes una sesión de caja abierta.")
    monto_inicial = money(data.get("monto_inicial", 0))
    if monto_inicial < 0:
        raise BusinessRuleError("El monto inicial no puede ser negativo.")
    sesion = CajaSesion(
        usuario_apertura=user,
        fecha_apertura=timezone.now(),
        monto_inicial=monto_inicial,
        moneda=(data.get("moneda") or "USD").upper(),
        estado=CajaSesion.Estado.ABIERTA,
        created_by=user,
    )
    _validar(sesion)
    sesion.save()
    logger.info("Caja: sesión %s abierta por %s", sesion.id, getattr(user, "email", "sistema"))
    return sesion


def _resumen_caja(sesion: CajaSesion):
    movs = sesion.movimientos.all()
    ingresos = movs.filter(tipo=MovimientoCaja.Tipo.INGRESO, es_efectivo=True).aggregate(
        s=Sum("monto")
    )["s"] or Decimal("0")
    egresos = movs.filter(tipo=MovimientoCaja.Tipo.EGRESO, es_efectivo=True).aggregate(
        s=Sum("monto")
    )["s"] or Decimal("0")
    esperado = money(to_decimal(sesion.monto_inicial) + to_decimal(ingresos) - to_decimal(egresos))
    return money(ingresos), money(egresos), esperado


@transaction.atomic
def cerrar_caja(
    sesion: CajaSesion, monto_declarado, observaciones: str = "", user=None
) -> CajaSesion:
    sesion = CajaSesion.objects.select_for_update().get(pk=sesion.pk)
    if sesion.estado != CajaSesion.Estado.ABIERTA:
        raise BusinessRuleError("La sesión de caja no está abierta.")
    if (
        sesion.usuario_apertura_id != getattr(user, "id", None)
        and getattr(user, "rol", None) != "admin"
    ):
        raise BusinessRuleError("Solo puedes cerrar tu propia sesión de caja.")

    monto_declarado = money(monto_declarado)
    _ing, _egr, esperado = _resumen_caja(sesion)
    sesion.monto_final_declarado = monto_declarado
    sesion.monto_sistema = esperado
    sesion.diferencia = money(monto_declarado - esperado)
    sesion.observaciones = (observaciones or "").strip()
    sesion.usuario_cierre = user
    sesion.fecha_cierre = timezone.now()
    sesion.estado = CajaSesion.Estado.CERRADA
    sesion.save(
        update_fields=[
            "monto_final_declarado",
            "monto_sistema",
            "diferencia",
            "observaciones",
            "usuario_cierre",
            "fecha_cierre",
            "estado",
            "updated_at",
        ]
    )
    logger.info(
        "Caja: sesión %s cerrada por %s (dif=%s)",
        sesion.id,
        getattr(user, "email", "sistema"),
        sesion.diferencia,
    )
    return sesion
