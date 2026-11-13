"""Servicios del dominio empresa."""

import logging
from datetime import date, datetime, time
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from apps.common.utils.files import delete_replaced_file

from django.db import transaction
from django.db.models import Q

from .models import Empresa, TasaCambio

logger = logging.getLogger("auditoria")

# Monedas que el negocio cotiza a diario contra el bolÃ­var.
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
    """Ãšltima tasa conocida del par hasta el final de `fecha`."""
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
    """Deriva el par cuando no estÃ¡ registrado, usando el cruce por bolÃ­vares.

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

    - Varios registros en un mismo dÃ­a son vÃ¡lidos (correcciones): aplica el
      Ãºltimo del dÃ­a.
    - Si ese dÃ­a no tiene tasa, se arrastra la Ãºltima tasa anterior conocida.
    - Nunca usa tasas con vigencia posterior al dÃ­a consultado.
    - Si el par no estÃ¡ registrado, se deriva por cruce con el bolÃ­var.
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
    """Ãšltima cotizaciÃ³n en bolÃ­vares de cada moneda, para la fecha indicada.

    Incluye la fecha real de vigencia para distinguir la tasa del dÃ­a de una
    tasa arrastrada de dÃ­as anteriores.
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
def eliminar_tasa(tasa: TasaCambio) -> None:
    """Elimina fÃ­sicamente una tasa del histÃ³rico."""
    descripcion = f"{tasa.moneda_base}/{tasa.moneda} {tasa.tasa} ({tasa.vigente_desde:%Y-%m-%d %H:%M})"
    tasa.delete()
    logger.info("Empresa: tasa %s eliminada", descripcion)


@transaction.atomic
def upsert_empresa(data: dict, user=None) -> Empresa:
    """Crea o actualiza la empresa singleton."""
    empresa = Empresa.get_solo()
    logo_previo = empresa.logo if empresa is not None else None
    # `logo` presente y vacÃ­o (`""` o null): el cliente pidiÃ³ borrarlo.
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

    # Borra el archivo fÃ­sico si se quitÃ³ el logo o si se reemplazÃ³.
    delete_replaced_file(logo_previo, empresa.logo)
    return empresa

ALLOWED_DB_RESET_EMAIL = "wilmere.vargas@gmail.com"


@transaction.atomic
def limpiar_base_datos(*, requested_by) -> dict[str, int]:
    """Elimina registros operativos y deja la BD lista para arranque en limpio.

    Conserva: Empresa, TasaCambio, CategoriaProducto, UnidadMedida y el usuario
    autorizado que ejecuta la acción. Elimina el resto de datos.
    """
    email = (getattr(requested_by, "email", "") or "").strip().lower()
    if email != ALLOWED_DB_RESET_EMAIL:
        raise PermissionError("Solo el usuario autorizado puede limpiar la base de datos.")

    from django.contrib.auth import get_user_model
    from apps.accounts.models import UserEmailAdicional
    from apps.clients.models import Cliente, Proveedor
    from apps.common.models import Secuencia
    from apps.finances.models import Deuda
    from apps.inventory.models import Combo, ComboProducto, MovimientoInventario, Producto
    from apps.orders.models import Pedido, PedidoDetalle
    from apps.purchases.models import Compra, CompraDetalle

    User = get_user_model()
    deleted: dict[str, int] = {}

    # Dependientes primero para respetar FKs PROTECT.
    for label, qs in [
        ("movimientos_inventario", MovimientoInventario.objects.all()),
        ("detalles_pedido", PedidoDetalle.objects.all()),
        ("deudas", Deuda.objects.all()),
        ("pedidos", Pedido.objects.all()),
        ("detalles_compra", CompraDetalle.objects.all()),
        ("compras", Compra.objects.all()),
        ("combo_productos", ComboProducto.objects.all()),
        ("combos", Combo.objects.all()),
        ("productos", Producto.objects.all()),
        ("clientes", Cliente.objects.all()),
        ("proveedores", Proveedor.objects.all()),
        ("secuencias", Secuencia.objects.all()),
        ("correos_adicionales", UserEmailAdicional.objects.exclude(user__email__iexact=ALLOWED_DB_RESET_EMAIL)),
        ("usuarios", User.objects.exclude(email__iexact=ALLOWED_DB_RESET_EMAIL)),
    ]:
        count, _ = qs.delete()
        deleted[label] = count

    # Limpieza de tokens/sesiones si existen (best-effort).
    for app_label, model_name in [
        ("token_blacklist", "OutstandingToken"),
        ("token_blacklist", "BlacklistedToken"),
        ("sessions", "Session"),
    ]:
        try:
            from django.apps import apps as django_apps
            model = django_apps.get_model(app_label, model_name)
        except Exception:
            continue
        if model_name == "OutstandingToken":
            count, _ = model.objects.exclude(user__email__iexact=ALLOWED_DB_RESET_EMAIL).delete()
        else:
            count, _ = model.objects.all().delete()
        deleted[model._meta.db_table] = count

    logger.warning("Base de datos depurada por %s. Eliminados: %s", email, deleted)
    return deleted
