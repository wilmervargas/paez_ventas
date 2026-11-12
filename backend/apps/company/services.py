"""Servicios del dominio empresa."""

import logging
from datetime import date, datetime, time
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from apps.common.utils.files import delete_replaced_file

from .models import Empresa, TasaCambio

logger = logging.getLogger("auditoria")

# Monedas que el negocio cotiza a diario contra el bolívar.
MONEDAS_COTIZADAS = ("USD", "EUR", "USDT")


def get_empresa() -> Empresa | None:
    return Empresa.get_solo()


def get_moneda_base(empresa: Empresa | None = None) -> str:
    """Moneda base configurada en la empresa (USD si no hay empresa)."""
    if empresa is None:
        empresa = get_empresa()
    return ((empresa.moneda_base if empresa else "") or "USD").strip().upper()


def _fin_del_dia(fecha: date) -> datetime:
    return timezone.make_aware(datetime.combine(fecha, time.max))


def _ultima_tasa(moneda: str, moneda_base: str, fecha: date) -> TasaCambio | None:
    """Última tasa conocida del par hasta el final de `fecha`."""
    return (
        TasaCambio.objects.filter(
            moneda=moneda.upper(),
            moneda_base=moneda_base.upper(),
            vigente_desde__lte=_fin_del_dia(fecha),
        )
        .order_by("-vigente_desde", "-id")
        .first()
    )


def _tasa_cruzada(moneda: str, moneda_base: str, fecha: date) -> TasaCambio | None:
    """Deriva el par cuando no está registrado, usando el cruce por bolívares.

    Ej.: con 1 USD = 40 Bs y 1 EUR = 44 Bs, devuelve 1 USD = 1,1 EUR, que es
    lo que necesita un documento en euros sobre una empresa con base USD.
    """
    if moneda == "VES" or moneda_base == "VES":
        return None

    cotizacion_moneda = _ultima_tasa("VES", moneda, fecha)
    cotizacion_base = _ultima_tasa("VES", moneda_base, fecha)
    if cotizacion_moneda is None or cotizacion_base is None:
        return None
    if cotizacion_moneda.tasa <= 0:
        return None

    tasa = (cotizacion_base.tasa / cotizacion_moneda.tasa).quantize(
        Decimal("0.000001"),
        rounding=ROUND_HALF_UP,
    )
    return TasaCambio(
        moneda=moneda,
        moneda_base=moneda_base,
        tasa=tasa,
        fuente=cotizacion_base.fuente,
        vigente_desde=max(cotizacion_moneda.vigente_desde, cotizacion_base.vigente_desde),
    )


def get_tasa_del_dia(
    moneda: str = "VES",
    fecha: date | None = None,
    base: str | None = None,
) -> TasaCambio | None:
    """Tasa aplicable a una fecha: unidades de `moneda` por 1 unidad de `base`.

    - Varios registros en un mismo día son válidos (correcciones): aplica el
      último del día.
    - Si ese día no tiene tasa, se arrastra la última tasa anterior conocida.
    - Nunca usa tasas con vigencia posterior al día consultado.
    - Si el par no está registrado, se deriva por cruce con el bolívar.
    """
    if fecha is None:
        fecha = timezone.localdate()
    if isinstance(fecha, datetime):
        fecha = fecha.date()

    moneda = (moneda or get_moneda_base()).strip().upper()
    moneda_base = (base or get_moneda_base()).strip().upper()
    if moneda == moneda_base:
        return None

    directa = _ultima_tasa(moneda, moneda_base, fecha)
    if directa is not None:
        return directa
    return _tasa_cruzada(moneda, moneda_base, fecha)


def get_tasa_vigente(moneda: str = "VES", base: str | None = None) -> TasaCambio | None:
    """Devuelve la tasa vigente hoy para el par indicado."""
    return get_tasa_del_dia(moneda, base=base)


def get_resumen_tasas(
    fecha: date | None = None,
    monedas: tuple[str, ...] = MONEDAS_COTIZADAS,
) -> list[dict]:
    """Última cotización en bolívares de cada moneda, para la fecha indicada.

    Incluye la fecha real de vigencia para distinguir la tasa del día de una
    tasa arrastrada de días anteriores.
    """
    if fecha is None:
        fecha = timezone.localdate()
    if isinstance(fecha, datetime):
        fecha = fecha.date()

    resumen: list[dict] = []
    for moneda in monedas:
        tasa = get_tasa_del_dia("VES", fecha, base=moneda)
        if tasa is None:
            resumen.append(
                {
                    "moneda": moneda,
                    "tasa": None,
                    "fuente": None,
                    "vigente_desde": None,
                    "es_del_dia": False,
                }
            )
            continue
        resumen.append(
            {
                "moneda": moneda,
                "tasa": tasa.tasa,
                "fuente": tasa.fuente,
                "vigente_desde": tasa.vigente_desde,
                "es_del_dia": timezone.localtime(tasa.vigente_desde).date() == fecha,
            }
        )
    return resumen


@transaction.atomic
def upsert_empresa(data: dict, user=None) -> Empresa:
    """Crea o actualiza la empresa singleton."""
    empresa = Empresa.get_solo()
    logo_previo = empresa.logo if empresa is not None else None
    # `logo` presente y vacío (`""` o null): el cliente pidió borrarlo.
    quitar_logo = "logo" in data and data["logo"] in (None, "")
    if quitar_logo:
        data["logo"] = ""

    if empresa is None:
        empresa = Empresa(**data)
        if user is not None and user.is_authenticated:
            empresa.created_by = user
    else:
        for field, value in data.items():
            setattr(empresa, field, value)
    empresa.save()

    # Borra el archivo físico si se quitó el logo o si se reemplazó.
    delete_replaced_file(logo_previo, empresa.logo)
    return empresa
