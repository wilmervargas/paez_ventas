"""Integración con el servidor local de WhatsApp (`ws/server`).

El servicio `ws/` (Express + Baileys) expone:

- ``GET  /api/whatsapp/status``
- ``POST /api/whatsapp/send`` con ``{to, message}``

Django solo consume esa API interna; la sesión/QR se administra en el propio
servidor de WhatsApp. Nunca se envían mensajes de forma automática: cada envío
lo dispara el usuario desde el módulo de Deudas y Cobros.
"""

from __future__ import annotations

import json
import logging
from urllib import error, request
from urllib.parse import quote

from django.conf import settings
from django.db.models import Sum

from apps.common.exceptions import BusinessRuleError
from apps.common.utils.money import money
from apps.common.utils.phone import normalize_phone, phone_digits

logger = logging.getLogger(__name__)

MONEDAS = {"USD": "$", "VES": "Bs", "EUR": "€", "USDT": "USDT", "AJU": "AJU"}


# ---------------------------------------------------------------------------
# Cliente HTTP del servidor de WhatsApp
# ---------------------------------------------------------------------------
def _gateway_url() -> str:
    return (getattr(settings, "WHATSAPP_WS_URL", "") or "").rstrip("/")


def _timeout() -> int:
    try:
        return int(getattr(settings, "WHATSAPP_TIMEOUT", 20) or 20)
    except (TypeError, ValueError):
        return 20


def _request(path: str, method: str = "GET", payload: dict | None = None) -> dict:
    base = _gateway_url()
    if not base:
        raise BusinessRuleError(
            "El servidor de WhatsApp no está configurado (WHATSAPP_WS_URL).",
            code="whatsapp_no_configurado",
        )

    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = request.Request(f"{base}{path}", data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=_timeout()) as response:
            body = response.read().decode("utf-8") or "{}"
    except error.HTTPError as exc:
        detail = _mensaje_de_error(exc)
        logger.warning("WhatsApp ws respondió %s en %s: %s", exc.code, path, detail)
        raise BusinessRuleError(detail, code="whatsapp_error") from exc
    except (error.URLError, TimeoutError, OSError) as exc:
        logger.warning("No se pudo conectar con WhatsApp ws en %s: %s", path, exc)
        raise BusinessRuleError(
            "No se pudo conectar con el servidor de WhatsApp. "
            "Verifica que el servicio ws/ esté en ejecución.",
            code="whatsapp_no_disponible",
        ) from exc

    try:
        result = json.loads(body)
    except json.JSONDecodeError as exc:
        raise BusinessRuleError(
            "El servidor de WhatsApp devolvió una respuesta inválida.",
            code="whatsapp_respuesta_invalida",
        ) from exc
    if not isinstance(result, dict):
        raise BusinessRuleError(
            "El servidor de WhatsApp devolvió una respuesta inválida.",
            code="whatsapp_respuesta_invalida",
        )
    return result


def _mensaje_de_error(exc: error.HTTPError) -> str:
    try:
        body = exc.read().decode("utf-8")
        data = json.loads(body)
        if isinstance(data, dict) and data.get("error"):
            return str(data["error"])
    except (ValueError, OSError):
        pass
    if exc.code == 409:
        return "WhatsApp no está conectado. Vincula el dispositivo escaneando el código QR."
    return f"No se pudo enviar el mensaje por WhatsApp (HTTP {exc.code})."


def estado_whatsapp() -> dict:
    """Devuelve el estado de la sesión del servidor de WhatsApp."""
    data = _request("/api/whatsapp/status")
    return {
        "conectado": bool(data.get("connected")),
        "requiere_qr": bool(data.get("needsQr")),
        "mensaje": str(data.get("message") or ""),
        "estado": str(data.get("state") or ""),
        "numero": data.get("me"),
        "error": str(data.get("lastError") or ""),
    }


def enviar_whatsapp(telefono: str, mensaje: str) -> dict:
    """Envía un mensaje de texto al cliente mediante el servidor de WhatsApp."""
    numero = normalize_phone(telefono) or phone_digits(telefono)
    if not (8 <= len(numero) <= 15):
        raise BusinessRuleError(
            "El cliente no tiene un teléfono válido (formato internacional, solo dígitos).",
            code="whatsapp_telefono_invalido",
        )

    texto = (mensaje or "").strip()
    if not texto:
        raise BusinessRuleError(
            "El mensaje no puede estar vacío.",
            code="whatsapp_mensaje_vacio",
        )

    data = _request(
        "/api/whatsapp/send",
        method="POST",
        payload={"to": numero, "message": texto},
    )
    if not data.get("success"):
        raise BusinessRuleError(
            str(data.get("error") or "No se pudo enviar el mensaje por WhatsApp."),
            code="whatsapp_envio_fallido",
        )

    logger.info("Cobranza: mensaje WhatsApp enviado a %s (id=%s)", numero, data.get("messageId"))
    return {
        "telefono": numero,
        "message_id": data.get("messageId"),
        "remitente": data.get("me"),
    }


# ---------------------------------------------------------------------------
# Resumen de deudas/pagos para el mensaje
# ---------------------------------------------------------------------------
def _fmt_monto(value, moneda: str = "USD") -> str:
    numero = f"{money(value):,.2f}"
    numero = numero.replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{MONEDAS.get(moneda, moneda)} {numero}"


def _fmt_fecha(value) -> str:
    return value.strftime("%d/%m/%Y") if value else ""


def resumen_cobro(deuda, mensaje: str | None = None) -> dict:
    """Construye el resumen del cliente (deudas + pagos) y el texto del mensaje."""
    from django.utils import timezone

    from apps.company.models import Empresa
    from apps.company.services import get_tasa_vigente

    from .models import Deuda, Pago

    cliente = deuda.cliente
    empresa = Empresa.get_solo()
    nombre_empresa = (empresa.nombre_comercial or empresa.razon_social) if empresa else "la empresa"

    deudas_qs = Deuda.objects.filter(cliente=cliente, estado=Deuda.Estado.PENDIENTE, saldo__gt=0)
    total_deudas = deudas_qs.count()
    deudas = list(
        deudas_qs.select_related("pedido")
        .prefetch_related("cuotas__aplicaciones__pago")
        .order_by("fecha_vencimiento", "-fecha_emision", "-id")
    )
    totales = list(deudas_qs.values("moneda").annotate(total=Sum("saldo")).order_by("moneda"))
    pagos_qs = Pago.objects.filter(cliente=cliente, anulado=False)
    pagos = list(pagos_qs.order_by("-fecha_pago", "-id"))

    tasa_aju = get_tasa_vigente("VES", base="AJU")
    if tasa_aju is not None:
        tasa_aju_texto = f"{money(tasa_aju.tasa):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        tasa_aju_fecha = _fmt_fecha(timezone.localtime(tasa_aju.vigente_desde).date())
        linea_tasa_aju = (
            f"*Tasa Ajustada (AJU) vigente al día del cobro:* "
            f"*_{tasa_aju_texto} Bs por 1 AJU_* (vigente desde {tasa_aju_fecha})"
        )
    else:
        linea_tasa_aju = "*Tasa Ajustada (AJU) vigente al día del cobro:* *_No disponible_*"

    lineas = [
        f"Hola {cliente.nombre} 👋",
        "",
        f"Le escribimos de *{nombre_empresa}* para recordarle su estado de cuenta.",
        "",
        linea_tasa_aju,
        "",
        "*Deudas pendientes:*",
    ]

    if deudas:
        for item in deudas:
            linea = f"Pedido {item.pedido.numero}: {_fmt_monto(item.saldo, item.moneda)}"
            saldo_ves_actual = getattr(item, "saldo_ves_actual", None)
            if saldo_ves_actual is not None:
                linea += f" · VES actualizado {_fmt_monto(saldo_ves_actual, 'VES')}"
            if item.fecha_vencimiento:
                linea += f" · vence {_fmt_fecha(item.fecha_vencimiento)}"
            proxima = next((c for c in item.cuotas.all() if c.saldo > 0), None)
            if proxima:
                if not item.fecha_vencimiento:
                    linea += f" · próxima cuota {_fmt_fecha(proxima.fecha_vencimiento)}"
                linea += f" · pendiente por pagar {_fmt_monto(proxima.saldo, item.moneda)}"
                monto_ves_cuota = getattr(proxima, "monto_ves_actual", None)
                if monto_ves_cuota is not None:
                    linea += f" · VES actualizado cuota {_fmt_monto(monto_ves_cuota, 'VES')}"
            lineas.append(f"• *_{linea}_*")
        # Se incluyen todas las deudas pendientes del cliente.
    else:
        lineas.append("• Sin deudas pendientes.")

    lineas.append("")
    if totales:
        resumen_total = " + ".join(_fmt_monto(t["total"], t["moneda"]) for t in totales)
        lineas.append(f"*Total pendiente:* *_{resumen_total}_*")
    else:
        lineas.append("*Total pendiente:* *_$ 0,00_*")

    lineas.extend(["", "*Pagos registrados:*"])
    if pagos:
        for pago in pagos:
            detalle = [
                f"• {_fmt_fecha(pago.fecha_pago)}",
                _fmt_monto(pago.monto, pago.moneda),
                f"Método: {pago.get_metodo_display()}",
            ]
            banco = (getattr(pago, "banco", "") or "").strip()
            referencia = (getattr(pago, "referencia", "") or "").strip()
            detalle.append(f"Banco: {banco or '—'}")
            detalle.append(f"Referencia: {referencia or '—'}")
            lineas.append(" · ".join(detalle))
        # Se incluyen todos los pagos registrados del cliente.
    else:
        lineas.append("• Sin pagos registrados.")

    lineas.extend(
        [
            "",
            "Si ya realizó su pago, por favor ignore este mensaje.",
            "Para cualquier consulta puede responder a este WhatsApp.",
        ]
    )

    texto = (mensaje or "").strip() or "\n".join(lineas)
    telefono = normalize_phone(cliente.telefono) or phone_digits(cliente.telefono)
    wa_url = f"https://wa.me/{telefono}?text={quote(texto)}" if telefono else ""

    return {
        "cliente": {
            "id": cliente.id,
            "nombre": cliente.nombre,
            "codigo": cliente.codigo,
            "telefono": cliente.telefono,
        },
        "telefono": telefono,
        "mensaje": texto,
        "wa_url": wa_url,
        "deudas": [
            {
                "id": item.id,
                "pedido_numero": item.pedido.numero,
                "saldo": str(money(item.saldo)),
                "moneda": item.moneda,
                "fecha_vencimiento": item.fecha_vencimiento,
                "vencida": item.vencida,
            }
            for item in deudas
        ],
        "pagos": [
            {
                "id": pago.id,
                "numero": pago.numero,
                "fecha_pago": pago.fecha_pago,
                "monto": str(money(pago.monto)),
                "moneda": pago.moneda,
                "metodo": pago.get_metodo_display(),
            }
            for pago in pagos
        ],
        "totales": [
            {"moneda": item["moneda"], "total": str(money(item["total"]))} for item in totales
        ],
    }
