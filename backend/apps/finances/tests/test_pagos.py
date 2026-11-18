"""Tests de registro de pagos."""

from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse

from apps.finances.models import CajaSesion, Deuda, Pago
from apps.orders.models import Pedido

pytestmark = pytest.mark.django_db


def _crear_deuda(cliente):
    pedido = Pedido.objects.create(
        numero="PED-2026-000001",
        cliente=cliente,
        fecha=date(2026, 1, 1),
        total=Decimal("100.00"),
    )
    return Deuda.objects.create(
        cliente=cliente,
        pedido=pedido,
        moneda="VES",
        tasa_cambio=Decimal("40.000000"),
        monto_original=Decimal("100.00"),
        saldo=Decimal("100.00"),
        fecha_emision=date(2026, 1, 1),
        fecha_vencimiento=date(2026, 1, 15),
    )


def test_pago_efectivo_sin_caja_abierta_se_registra(admin_client, empresa, cliente):
    deuda = _crear_deuda(cliente)
    assert CajaSesion.objects.count() == 0

    response = admin_client.post(
        reverse("pago-list"),
        {
            "deuda_id": deuda.pk,
            "fecha_pago": date(2026, 1, 10).isoformat(),
            "metodo": "efectivo",
            "monto": "100.00",
            "moneda": "VES",
            "tasa_cambio": "40.000000",
        },
        format="json",
    )

    assert response.status_code == 201, response.data
    assert response.data["caja_sesion"] is None

    pago = Pago.objects.get(pk=response.data["id"])
    assert pago.metodo == Pago.Metodo.EFECTIVO
    assert pago.caja_sesion is None

    deuda.refresh_from_db()
    assert deuda.saldo == Decimal("0.00")
    assert deuda.estado == Deuda.Estado.PAGADA
