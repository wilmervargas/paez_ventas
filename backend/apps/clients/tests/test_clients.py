"""Tests de clientes y proveedores."""

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


def test_cliente_no_se_elimina(admin_client, empresa):
    creado = admin_client.post(reverse("cliente-list"), CLIENTE_PAYLOAD, format="json")

    response = admin_client.delete(reverse("cliente-detail", args=[creado.data["id"]]))
    assert response.status_code == 405
    assert Cliente.objects.count() == 1


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
