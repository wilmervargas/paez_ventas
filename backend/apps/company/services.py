"""Servicios del dominio empresa."""

import json
import logging
import os
import tempfile
import zipfile
from datetime import date, datetime, time
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from urllib.error import URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.mail import EmailMessage
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from apps.common.utils.files import delete_replaced_file

from .models import Empresa, TasaCambio

logger = logging.getLogger("auditoria")

BCV_RATE_URL = getattr(settings, "BCV_RATE_URL", "https://bcv.today/api/v1/rate.json")
USDT_RATE_URL = getattr(
    settings,
    "USDT_RATE_URL",
    "https://www.usdt.com.ve/api/v1/rates/current",
)
RATES_SYNC_TIMEOUT = getattr(settings, "RATES_SYNC_TIMEOUT", 10)

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


def _es_fecha_hoy(fecha):
    if fecha is None:
        return True
    if isinstance(fecha, datetime):
        fecha = fecha.date()
    return fecha == timezone.localdate()


def _tiene_tasa_del_dia(moneda, moneda_base, fecha):
    tasa = _ultima_tasa(moneda, moneda_base, fecha)
    if tasa is None:
        return False
    return timezone.localtime(tasa.vigente_desde).date() == fecha


def _vigente_desde_para_fecha(fecha):
    """Datetime de vigencia: inicio del día en que entra en vigencia la tasa."""
    return timezone.make_aware(datetime.combine(fecha, time.min))


def _fetch_json(url):
    req = Request(url, headers={"Accept": "application/json", "User-Agent": "paez-rates/1.0"})
    with urlopen(req, timeout=RATES_SYNC_TIMEOUT) as resp:  # noqa: S310
        return json.loads(resp.read().decode("utf-8"))


def _crear_tasa_si_falta(moneda_base, tasa_valor, fuente, fecha_efectiva, observacion=""):
    """Crea la tasa VES/<moneda_base> para la fecha de vigencia indicada.

    - Si ya existe un registro del día para ese par, no modifica nada.
    - Registra la fecha en que entra en vigencia (no la fecha de declaración).
    Retorna: "creada", "existente" o "omitida".
    """
    if _tiene_tasa_del_dia("VES", moneda_base, fecha_efectiva):
        return "existente"
    if tasa_valor <= 0:
        return "omitida"

    vigente_desde = _vigente_desde_para_fecha(fecha_efectiva)

    try:
        with transaction.atomic():
            # No alterar registros existentes del día; solo crear si falta.
            if _tiene_tasa_del_dia("VES", moneda_base, fecha_efectiva):
                return "existente"
            if TasaCambio.objects.filter(
                moneda="VES", moneda_base=moneda_base, vigente_desde=vigente_desde
            ).exists():
                # Misma vigencia exacta ya registrada: no duplicar ni modificar.
                return "existente"
            TasaCambio.objects.create(
                moneda="VES",
                moneda_base=moneda_base,
                tasa=tasa_valor,
                fuente=fuente,
                vigente_desde=vigente_desde,
            )
        logger.info(
            "Tasas: registrada VES/%s=%s fuente=%s fecha_vigencia=%s %s",
            moneda_base,
            tasa_valor,
            fuente,
            fecha_efectiva.isoformat(),
            observacion,
        )
        return "creada"
    except IntegrityError:
        return "existente"
    except Exception:  # pragma: no cover
        logger.exception("Tasas: no se pudo registrar VES/%s", moneda_base)
        return "omitida"


def _sincronizar_bcv(fecha_objetivo):
    resultado = {"fuente": "bcv", "creadas": [], "omitidas": [], "errores": []}
    try:
        data = _fetch_json(BCV_RATE_URL)
    except Exception as exc:
        resultado["errores"].append(f"bcv.today: {exc}")
        logger.warning("Tasas: fallo consultando BCV: %s", exc)
        return resultado
    effective = parse_date(str(data.get("effective_date") or ""))
    if not effective:
        resultado["errores"].append("bcv.today: effective_date inválida o ausente")
        return resultado
    if effective != fecha_objetivo:
        resultado["omitidas"].append(
            "USD/EUR: effective_date %s != %s" % (effective.isoformat(), fecha_objetivo.isoformat())
        )
        return resultado

    # La fecha registrada es la de vigencia (effective_date), no la de declaración.
    for base in ("USD", "EUR"):
        raw = data.get(base)
        if raw in (None, ""):
            resultado["errores"].append(f"bcv.today: falta {base}")
            continue
        try:
            tasa_valor = Decimal(str(raw)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        except (InvalidOperation, ValueError):
            resultado["errores"].append(f"bcv.today: {base} inválido")
            continue
        estado = _crear_tasa_si_falta(base, tasa_valor, "bcv", effective)
        (resultado["creadas"] if estado == "creada" else resultado["omitidas"]).append(base)
    return resultado


def _sincronizar_usdt(fecha_objetivo):
    resultado = {"fuente": "usdt", "creadas": [], "omitidas": [], "errores": []}
    try:
        data = _fetch_json(USDT_RATE_URL)
    except Exception as exc:
        resultado["errores"].append(f"usdt.com.ve: {exc}")
        logger.warning("Tasas: fallo consultando USDT: %s", exc)
        return resultado
    payload = data.get("data") or {}
    captured_raw = payload.get("captured_at") or data.get("captured_at")
    captured = parse_datetime(str(captured_raw)) if captured_raw else None
    if captured is None:
        resultado["errores"].append("usdt.com.ve: captured_at inválido o ausente")
        return resultado
    fecha_captura = timezone.localtime(captured).date() if timezone.is_aware(captured) else captured.date()
    if fecha_captura != fecha_objetivo:
        resultado["omitidas"].append(
            "USDT: captured_at %s != %s" % (fecha_captura.isoformat(), fecha_objetivo.isoformat())
        )
        return resultado
    best = payload.get("best") or {}
    # Se usa la mejor tasa de compra disponible (referencia de mercado).
    raw = best.get("buy_rate") or payload.get("binance", {}).get("buy_rate")
    if raw in (None, ""):
        resultado["errores"].append("usdt.com.ve: no se encontró tasa USDT (buy_rate)")
        return resultado
    try:
        tasa_valor = Decimal(str(raw)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        resultado["errores"].append("usdt.com.ve: tasa USDT inválida")
        return resultado
    # La fecha registrada es la de vigencia (fecha de la tasa), no la de declaración.
    estado = _crear_tasa_si_falta("USDT", tasa_valor, "usdt", fecha_captura)
    (resultado["creadas"] if estado == "creada" else resultado["omitidas"]).append("USDT")
    return resultado


def sincronizar_tasas_externas(fecha=None):
    """Consulta fuentes externas y registra USD/EUR/USDT para la fecha indicada.

    Verifica la fecha informada por cada fuente antes de capturar. Solo crea
    tasas faltantes del día; no modifica registros existentes (edición manual).
    """
    if fecha is None:
        fecha = timezone.localdate()
    if isinstance(fecha, datetime):
        fecha = fecha.date()
    return {"fecha": fecha.isoformat(), "fuentes": [_sincronizar_bcv(fecha), _sincronizar_usdt(fecha)]}


_sync_hoy_en_curso = False
_auto_sync_intentado_fecha = None


def asegurar_tasas_del_dia(fecha=None, forzar=False):
    """Si faltan tasas del día (USD/EUR/USDT) para la fecha, intenta sincronizar.

    La actualización automática se ejecuta una sola vez por fecha: tras el primer
    intento del día no se reintenta automáticamente, aunque la fuente aún no haya
    publicado la tasa vigente o la consulta falle.
    """
    global _sync_hoy_en_curso, _auto_sync_intentado_fecha
    if fecha is None:
        fecha = timezone.localdate()
    if isinstance(fecha, datetime):
        fecha = fecha.date()
    hoy = timezone.localdate()

    faltantes = [base for base in MONEDAS_COTIZADAS if not _tiene_tasa_del_dia("VES", base, fecha)]
    if not faltantes or _sync_hoy_en_curso:
        return None

    # Auto-sync: una sola vez por día/fecha. La sincronización manual (forzar) no se bloquea.
    if not forzar and fecha == hoy and _auto_sync_intentado_fecha == hoy:
        return None

    _sync_hoy_en_curso = True
    try:
        resultado = sincronizar_tasas_externas(fecha)
        if not forzar and fecha == hoy:
            _auto_sync_intentado_fecha = hoy
        return resultado
    except Exception:
        logger.exception("Tasas: error inesperado en sincronización automática")
        if not forzar and fecha == hoy:
            # Intento automático realizado una sola vez, incluso si hubo error.
            _auto_sync_intentado_fecha = hoy
        return None
    finally:
        _sync_hoy_en_curso = False


def get_tasa_del_dia(moneda="VES", fecha=None, base=None, auto_sync=True):
    """Tasa aplicable a una fecha: unidades de `moneda` por 1 unidad de `base`.

    - Varios registros en un mismo día son válidos (correcciones): aplica el
      último del día.
    - Si ese día no tiene tasa, se arrastra la última tasa anterior conocida.
    - Nunca usa tasas con vigencia posterior al día consultado.
    - Si el par no está registrado, se deriva por cruce con el bolívar.
    - Si se consulta el día actual y falta la tasa, intenta sincronizarla una sola vez.
    """
    if fecha is None:
        fecha = timezone.localdate()
    if isinstance(fecha, datetime):
        fecha = fecha.date()
    moneda = (moneda or get_moneda_base()).strip().upper()
    moneda_base = (base or get_moneda_base()).strip().upper()
    if moneda == moneda_base:
        return None
    if auto_sync and _es_fecha_hoy(fecha) and moneda == "VES" and moneda_base in MONEDAS_COTIZADAS:
        if not _tiene_tasa_del_dia(moneda, moneda_base, fecha):
            asegurar_tasas_del_dia(fecha)
    directa = _ultima_tasa(moneda, moneda_base, fecha)
    if directa is not None:
        return directa
    return _tasa_cruzada(moneda, moneda_base, fecha)


def get_tasa_vigente(moneda="VES", base=None):
    """Devuelve la tasa vigente hoy para el par indicado."""
    return get_tasa_del_dia(moneda, base=base)


def get_resumen_tasas(fecha=None, monedas=MONEDAS_COTIZADAS, auto_sync=True):
    """Última cotización en bolívares de cada moneda, para la fecha indicada.

    Incluye la fecha real de vigencia para distinguir la tasa del día de una
    tasa arrastrada de días anteriores. Si es la fecha actual y faltan tasas,
    intenta sincronizarlas automáticamente desde las fuentes configuradas.
    """
    if fecha is None:
        fecha = timezone.localdate()
    if isinstance(fecha, datetime):
        fecha = fecha.date()
    if auto_sync and _es_fecha_hoy(fecha):
        asegurar_tasas_del_dia(fecha)
    resumen = []
    for moneda in monedas:
        tasa = get_tasa_del_dia("VES", fecha, base=moneda, auto_sync=False)
        if tasa is None:
            resumen.append({"moneda": moneda, "tasa": None, "fuente": None, "vigente_desde": None, "es_del_dia": False})
            continue
        resumen.append({
            "moneda": moneda,
            "tasa": tasa.tasa,
            "fuente": tasa.fuente,
            "vigente_desde": tasa.vigente_desde,
            "es_del_dia": timezone.localtime(tasa.vigente_desde).date() == fecha,
        })
    return resumen




@transaction.atomic
def eliminar_tasa(tasa: TasaCambio) -> None:
    """Elimina fÃ­sicamente una tasa del histÃ³rico."""
    descripcion = (
        f"{tasa.moneda_base}/{tasa.moneda} {tasa.tasa} ({tasa.vigente_desde:%Y-%m-%d %H:%M})"
    )
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


def limpiar_base_datos(*, requested_by) -> dict[str, int]:
    """Depura la base de datos conservando solo datos base/configuración.

    Conserva exclusivamente: Empresa, TasaCambio, CategoriaProducto, UnidadMedida
    y todos los usuarios (incluyendo sus correos adicionales). Elimina el resto
    de registros operativos/transaccionales y cualquier tabla vinculada a ellos.

    El borrado se ejecuta paso a paso, en orden de dependencias (hijos antes que
    padres), para respetar las FK con PROTECT y evitar conflictos de integridad.
    """
    if not getattr(requested_by, "is_superuser", False):
        raise PermissionError("Solo los superusuarios pueden limpiar la base de datos.")

    from django.apps import apps as django_apps
    from django.db import connection

    from apps.clients.models import Cliente, Proveedor
    from apps.common.models import Secuencia
    from apps.finances.models import CajaSesion, Cuota, Deuda, MovimientoCaja, Pago, PagoAplicacion
    from apps.inventory.models import Combo, ComboProducto, MovimientoInventario, Producto
    from apps.orders.models import Pedido, PedidoDetalle
    from apps.purchases.models import Compra, CompraDetalle

    # Pasos de limpieza transaccional, ordenados por dependencias (dependientes primero).
    # Conservados: Empresa, TasaCambio, CategoriaProducto, UnidadMedida, User, UserEmailAdicional.
    pasos = [
        # 1) Finanzas/cobros: aplicaciones y movimientos dependen de pagos/cuotas/caja/deudas.
        ("aplicaciones_pago", PagoAplicacion.objects.all()),
        ("movimientos_caja", MovimientoCaja.objects.all()),
        ("pagos", Pago.objects.all()),
        ("cuotas", Cuota.objects.all()),
        # 2) Pedidos y deudas: la deuda referencia al pedido (PROTECT), sus detalles y cuotas ya no existen.
        ("deudas", Deuda.objects.all()),
        ("detalles_pedido", PedidoDetalle.objects.all()),
        ("pedidos", Pedido.objects.all()),
        # 3) Caja: ya sin pagos ni movimientos asociados.
        ("sesiones_caja", CajaSesion.objects.all()),
        # 4) Compras: detalles antes de la cabecera.
        ("detalles_compra", CompraDetalle.objects.all()),
        ("compras", Compra.objects.all()),
        # 5) Inventario/kardex y catálogo operativo (se conservan solo categorías y unidades).
        ("movimientos_inventario", MovimientoInventario.objects.all()),
        ("combo_productos", ComboProducto.objects.all()),
        ("combos", Combo.objects.all()),
        ("productos", Producto.objects.all()),
        # 6) Terceros y numeración interna.
        ("clientes", Cliente.objects.all()),
        ("proveedores", Proveedor.objects.all()),
        ("secuencias", Secuencia.objects.all()),
    ]

    deleted: dict[str, int] = {}
    tablas_limpiadas_completo = [qs.model._meta.db_table for _, qs in pasos]

    with transaction.atomic():
        for label, qs in pasos:
            count, _ = qs.delete()
            deleted[label] = count

        # 7) Sesiones y tokens de autenticación (best-effort). No se eliminan usuarios.
        for app_label, model_name in [
            ("token_blacklist", "BlacklistedToken"),
            ("token_blacklist", "OutstandingToken"),
            ("sessions", "Session"),
        ]:
            try:
                model = django_apps.get_model(app_label, model_name)
            except Exception:
                continue
            count, _ = model.objects.all().delete()
            deleted[model._meta.db_table] = count
            tablas_limpiadas_completo.append(model._meta.db_table)

    # Optimización post-limpieza (fuera de la transacción).
    if connection.vendor == "sqlite":
        optimizado = False
        try:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'"
                )
                if cursor.fetchone():
                    for table in dict.fromkeys(tablas_limpiadas_completo):
                        cursor.execute("DELETE FROM sqlite_sequence WHERE name = %s", [table])
            optimizado = True
        except Exception:
            logger.exception("Limpieza: no se pudo reiniciar sqlite_sequence")

        # VACUUM requiere estar fuera de cualquier bloque transaccional.
        if not connection.in_atomic_block:
            try:
                if not connection.get_autocommit():
                    connection.set_autocommit(True)
                with connection.cursor() as cursor:
                    cursor.execute("VACUUM")
                optimizado = True
            except Exception:
                logger.exception("Limpieza: no se pudo completar VACUUM en SQLite")
                optimizado = False
        deleted["_optimizacion"] = 1 if optimizado else 0

    logger.warning(
        "Base de datos depurada por %s. Eliminados: %s",
        getattr(requested_by, "email", "sistema"),
        deleted,
    )
    return deleted


def hacer_respaldo_base_datos(*, requested_by, destinatario: str = "danielpaez.dell@gmail.com") -> dict:
    """Comprime db.sqlite3 y lo envía por correo, conservando intacto el archivo original."""
    if not getattr(requested_by, "is_superuser", False):
        raise PermissionError("Solo los superusuarios pueden generar respaldos.")

    db_path = settings.DATABASES["default"]["NAME"]
    db_path = str(db_path)
    if not os.path.exists(db_path):
        raise FileNotFoundError("No se encontró el archivo de base de datos.")

    fecha = timezone.localdate().strftime("%Y-%m-%d")
    nombre_zip = f"respaldo-db-{fecha}.zip"
    asunto = f"Respaldo base de datos - {fecha}"
    cuerpo = (
        f"Respaldo de la base de datos generado el {fecha}.\n\n"
        f"Solicitado por: {getattr(requested_by, 'email', 'sistema')}\n"
        "El archivo original db.sqlite3 permanece intacto en el servidor."
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        zip_path = os.path.join(tmpdir, nombre_zip)
        # Copia comprimida del archivo; no se modifica ni mueve el original.
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(db_path, arcname=os.path.basename(db_path))

        email = EmailMessage(
            subject=asunto,
            body=cuerpo,
            from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
            to=[destinatario],
        )
        email.attach_file(zip_path)
        enviados = email.send(fail_silently=False)

    if not enviados:
        raise RuntimeError("No se pudo enviar el correo de respaldo.")

    logger.info(
        "Respaldo de BD generado y enviado a %s por %s (%s)",
        destinatario,
        getattr(requested_by, "email", "sistema"),
        nombre_zip,
    )
    return {"destinatario": destinatario, "archivo": nombre_zip, "fecha": fecha}
