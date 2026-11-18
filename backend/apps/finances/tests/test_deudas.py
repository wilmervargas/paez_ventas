"""Tests del listado de deudas y cobros."""

from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse

from apps.finances.models import Deuda
from apps.orders.models import Pedido

pytestmark = pytest.mark.django_db


def _crear_deuda(cliente, numero, fecha_pedido, vencimiento=None):
    pedido = Pedido.objects.create(
        numero=numero,
        cliente=cliente,
        fecha=fecha_pedido,
        total=Decimal("10.00"),
    )
    return Deuda.objects.create(
        cliente=cliente,
        pedido=pedido,
        monto_original=Decimal("10.00"),
        saldo=Decimal("10.00"),
        fecha_emision=fecha_pedido,
        fecha_vencimiento=vencimiento or fecha_pedido,
    )


def test_listado_deudas_ordena_por_fecha_y_numero_de_pedido(admin_client, empresa, cliente):
    # El vencimiento de la primera es anterior a propósito: el orden debe regirse
    # por la fecha del pedido y, dentro de la misma fecha, por el número de pedido.
    _crear_deuda(cliente, "PED-2026-000003", date(2026, 2, 5), date(2026, 1, 1))
    _crear_deuda(cliente, "PED-2026-000001", date(2026, 1, 10))
    _crear_deuda(cliente, "PED-2026-000002", date(2026, 2, 5))

    esperado = ["PED-2026-000001", "PED-2026-000002", "PED-2026-000003"]

    con_parametro = admin_client.get(
        reverse("deuda-list"),
        {"ordering": "pedido__fecha,pedido__numero"},
    )
    assert con_parametro.status_code == 200
    assert [fila["pedido_numero"] for fila in con_parametro.data["results"]] == esperado

    por_defecto = admin_client.get(reverse("deuda-list"))
    assert por_defecto.status_code == 200
    assert [fila["pedido_numero"] for fila in por_defecto.data["results"]] == esperado
