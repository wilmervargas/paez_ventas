"""Tests del aviso de cobro por WhatsApp (integración con ws/server)."""

from datetime import date
from decimal import Decimal

import pytest

from apps.common.exceptions import BusinessRuleError
from apps.finances import views
from apps.finances.models import Deuda, Pago
from apps.finances.whatsapp import enviar_whatsapp, resumen_cobro
from apps.orders.models import Pedido


@pytest.fixture
def pedido(cliente):
    return Pedido.objects.create(
        numero="PED-2026-000001",
        cliente=cliente,
        estado=Pedido.Estado.CONFIRMADO,
        total=Decimal("100.00"),
    )


@pytest.fixture
def deuda(cliente, pedido):
    return Deuda.objects.create(
        cliente=cliente,
        pedido=pedido,
        monto_original=Decimal("100.00"),
        saldo=Decimal("60.00"),
        fecha_vencimiento=date(2026, 1, 15),
    )


@pytest.fixture
def pago(cliente):
    return Pago.objects.create(
        numero="PAG-2026-000001",
        cliente=cliente,
        monto=Decimal("40.00"),
        monto_base=Decimal("40.00"),
        metodo=Pago.Metodo.PAGO_MOVIL,
    )


@pytest.mark.django_db
def test_resumen_incluye_deuda_pago_y_enlace_wa(empresa, deuda, pago):
    resumen = resumen_cobro(deuda)

    assert resumen["telefono"] == "584141234567"
    assert "PED-2026-000001" in resumen["mensaje"]
    assert "PAG-2026-000001" not in resumen["mensaje"]
    assert "Pago móvil" in resumen["mensaje"]
    assert "Total pendiente" in resumen["mensaje"]
    assert resumen["deudas"][0]["saldo"] == "60.00"
    assert resumen["pagos"][0]["monto"] == "40.00"
    assert resumen["wa_url"].startswith("https://wa.me/584141234567?text=")


@pytest.mark.django_db
def test_envio_es_explicito_y_usa_el_servidor_ws(admin_client, empresa, deuda, monkeypatch):
    llamadas = {}

    def fake_enviar(telefono, mensaje):
        llamadas["telefono"] = telefono
        llamadas["mensaje"] = mensaje
        return {"telefono": telefono, "message_id": "msg-1", "remitente": "584244032682"}

    monkeypatch.setattr(views, "enviar_whatsapp", fake_enviar)

    response = admin_client.post(f"/api/v1/deudas/{deuda.id}/enviar-cobro/", {}, format="json")

    assert response.status_code == 200
    assert response.data["message_id"] == "msg-1"
    assert llamadas["telefono"] == "584141234567"
    assert "PED-2026-000001" in llamadas["mensaje"]


@pytest.mark.django_db
def test_vendedor_puede_ver_mensaje_pero_no_enviarlo(auth_client, empresa, deuda):
    vista = auth_client.get(f"/api/v1/deudas/{deuda.id}/mensaje-cobro/")
    envio = auth_client.post(f"/api/v1/deudas/{deuda.id}/enviar-cobro/", {}, format="json")

    assert vista.status_code == 200
    assert envio.status_code == 403


@pytest.mark.django_db
def test_envio_sin_telefono_valido_falla(empresa, deuda):
    deuda.cliente.telefono = "123"
    deuda.cliente.save(update_fields=["telefono"])

    with pytest.raises(BusinessRuleError):
        enviar_whatsapp(deuda.cliente.telefono, "Hola")


@pytest.mark.django_db
def test_estado_whatsapp_expone_sesion(admin_client, empresa, monkeypatch):
    monkeypatch.setattr(
        views,
        "estado_whatsapp",
        lambda: {"conectado": True, "requiere_qr": False, "mensaje": "ok"},
    )

    response = admin_client.get("/api/v1/whatsapp/estado/")

    assert response.status_code == 200
    assert response.data["conectado"] is True
