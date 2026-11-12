"""Tests de clientes y proveedores."""

from decimal import Decimal

import pytest
from django.urls import reverse

from apps.clients.models import Cliente

pytestmark = pytest.mark.django_db

CLIENTE_PAYLOAD = {
    "nombre": "María Pérez",
    "rif_cedula": "V-12345678",
    "telefono": "0414-1234567",
    "email": "maria@example.com",
    "direccion": "Caracas",
    "limite_credito": "150.00",
}


def test_vendedor_crea_cliente_con_codigo_automatico(auth_client, empresa):
    response = auth_client.post(reverse("cliente-list"), CLIENTE_PAYLOAD, format="json")

    assert response.status_code == 201
    assert response.data["codigo"] == "CL-00001"
    assert response.data["telefono"] == "+584141234567"
    assert Cliente.objects.count() == 1


def test_codigo_secuencial_no_se_repite(admin_client, empresa):
    primero = admin_client.post(reverse("cliente-list"), CLIENTE_PAYLOAD, format="json")
    segundo = admin_client.post(
        reverse("cliente-list"),
        {**CLIENTE_PAYLOAD, "nombre": "Otro Cliente"},
        format="json",
    )

    assert primero.data["codigo"] == "CL-00001"
    assert segundo.data["codigo"] == "CL-00002"


def test_telefono_invalido_es_rechazado(admin_client, empresa):
    response = admin_client.post(
        reverse("cliente-list"),
        {**CLIENTE_PAYLOAD, "telefono": "123"},
        format="json",
    )

    assert response.status_code == 400
    assert "telefono" in response.data["errors"]


def test_codigo_duplicado_es_rechazado(admin_client, empresa):
    admin_client.post(
        reverse("cliente-list"),
        {**CLIENTE_PAYLOAD, "codigo": "CL-999"},
        format="json",
    )
    response = admin_client.post(
        reverse("cliente-list"),
        {**CLIENTE_PAYLOAD, "codigo": "CL-999"},
        format="json",
    )

    assert response.status_code == 400
    assert "codigo" in response.data["errors"]


def test_cobrador_consulta_pero_no_crea_clientes(cobrador_client, empresa):
    assert cobrador_client.get(reverse("cliente-list")).status_code == 200

    response = cobrador_client.post(reverse("cliente-list"), CLIENTE_PAYLOAD, format="json")
    assert response.status_code == 403


def test_almacenista_no_puede_ver_clientes(almacenista_client, empresa):
    assert almacenista_client.get(reverse("cliente-list")).status_code == 403


def test_cliente_se_elimina_si_no_esta_vinculado(admin_client, empresa):
    creado = admin_client.post(reverse("cliente-list"), CLIENTE_PAYLOAD, format="json")

    response = admin_client.delete(reverse("cliente-detail", args=[creado.data["id"]]))
    assert response.status_code == 204
    assert Cliente.objects.count() == 0


def test_cliente_con_pedidos_no_se_elimina(admin_client, empresa, cliente, producto):
    from apps.orders.models import Pedido

    Pedido.objects.create(
        numero="PED-2026-000001",
        cliente=cliente,
        fecha="2026-11-11",
        moneda="USD",
        tasa_cambio="1.000000",
        subtotal=Decimal("100.00"),
        iva=Decimal("16.00"),
        total=Decimal("116.00"),
        total_base=Decimal("116.00"),
        created_by=None,
    )

    response = admin_client.delete(reverse("cliente-detail", args=[cliente.id]))
    assert response.status_code == 409
    assert response.data["code"] == "recurso_vinculado"
    assert Cliente.objects.filter(pk=cliente.id).exists()


def test_proveedor_se_elimina_si_no_esta_vinculado(admin_client, empresa):
    proveedor = admin_client.post(
        reverse("proveedor-list"),
        {
            "nombre": "Proveedor Temporal",
            "rif": "J-11111111-1",
            "telefono": "0212-5555555",
        },
        format="json",
    )

    response = admin_client.delete(reverse("proveedor-detail", args=[proveedor.data["id"]]))
    assert response.status_code == 204
    from apps.clients.models import Proveedor

    assert Proveedor.objects.count() == 0


def test_proveedor_con_compras_no_se_elimina(admin_client, empresa, proveedor, producto):
    from apps.purchases.models import Compra

    Compra.objects.create(
        numero="COMP-2026-000001",
        proveedor=proveedor,
        fecha="2026-11-11",
        moneda="USD",
        tasa_cambio="1.000000",
        subtotal=Decimal("100.00"),
        iva=Decimal("16.00"),
        total=Decimal("116.00"),
        total_base=Decimal("116.00"),
        estado="borrador",
        created_by=None,
    )

    response = admin_client.delete(reverse("proveedor-detail", args=[proveedor.id]))
    assert response.status_code == 409
    assert response.data["code"] == "recurso_vinculado"
    from apps.clients.models import Proveedor

    assert Proveedor.objects.filter(pk=proveedor.id).exists()


def test_almacenista_crea_proveedor(almacenista_client, empresa):
    response = almacenista_client.post(
        reverse("proveedor-list"),
        {
            "nombre": "Distribuidora Central",
            "rif": "J-98765432-1",
            "telefono": "0212-5555555",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["codigo"] == "PR-00001"


def test_vendedor_no_ve_proveedores(auth_client, empresa):
    assert auth_client.get(reverse("proveedor-list")).status_code == 403
