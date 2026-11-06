"""Tests de configuración de empresa, tasas y gate fiscal."""

import pytest
from django.db import connection
from django.urls import reverse

from apps.company.models import Empresa

pytestmark = pytest.mark.django_db

EMPRESA_PAYLOAD = {
    "razon_social": "Páez Servicios, C.A.",
    "nombre_comercial": "Páez Servicios",
    "rif": "J-12345678-9",
    "representante": "Wilmer Vargas",
    "direccion": "Caracas, Venezuela",
    "telefono": "+584141234567",
    "email": "contacto@paez.example",
    "moneda_base": "usd",
    "iva_rate": "16.00",
}


def test_gate_bloquea_endpoints_sin_empresa(auth_client):
    response = auth_client.get("/api/v1/tasas-cambio/")

    assert response.status_code == 409
    assert response.data["code"] == "company_setup_required"


def test_company_get_sin_configurar_devuelve_404(auth_client):
    response = auth_client.get(reverse("empresa"))

    assert response.status_code == 404
    assert response.data["code"] == "company_not_configured"


def test_solo_admin_configura_la_empresa(auth_client):
    response = auth_client.put(reverse("empresa"), EMPRESA_PAYLOAD, format="json")

    assert response.status_code == 403


def test_admin_configura_empresa_y_se_libera_el_gate(admin_client, auth_client):
    response = admin_client.put(reverse("empresa"), EMPRESA_PAYLOAD, format="json")

    assert response.status_code == 201
    assert Empresa.objects.count() == 1
    assert response.data["rif"] == "J-12345678-9"
    assert response.data["moneda_base"] == "USD"

    assert auth_client.get(reverse("empresa")).status_code == 200
    assert auth_client.get("/api/v1/tasas-cambio/").status_code == 200


def test_empresa_es_singleton(admin_client):
    first = admin_client.put(reverse("empresa"), EMPRESA_PAYLOAD, format="json")
    assert first.status_code == 201

    payload = {**EMPRESA_PAYLOAD, "nombre_comercial": "Nuevo Nombre"}
    second = admin_client.put(reverse("empresa"), payload, format="json")

    assert second.status_code == 200
    assert Empresa.objects.count() == 1
    assert second.data["nombre_comercial"] == "Nuevo Nombre"


def test_empresa_con_timestamps_corruptos_se_puede_actualizar(admin_client):
    created = admin_client.put(reverse("empresa"), EMPRESA_PAYLOAD, format="json")
    assert created.status_code == 201

    # Simula una fila cargada manualmente en SQLite sin timestamps válidos.
    with connection.cursor() as cursor:
        cursor.execute("UPDATE company_empresa SET created_at = 0, updated_at = '' WHERE id = 1")

    payload = {**EMPRESA_PAYLOAD, "nombre_comercial": "Nombre Corregido"}
    response = admin_client.patch(reverse("empresa"), payload, format="json")

    assert response.status_code == 200
    assert response.data["nombre_comercial"] == "Nombre Corregido"
    assert response.data["created_at"] is not None


def test_admin_crea_tasa_y_consulta_la_vigente(admin_client, empresa):
    response = admin_client.post(
        reverse("tasa-cambio-list"),
        {"moneda": "ves", "tasa": "40.500000", "fuente": "manual"},
        format="json",
    )

    assert response.status_code == 201
    assert response.data["moneda"] == "VES"

    vigente = admin_client.get(reverse("tasa-cambio-vigente"), {"moneda": "VES"})
    assert vigente.status_code == 200
    assert vigente.data["tasa"] == "40.500000"


def test_vendedor_no_puede_crear_tasas(auth_client, empresa):
    response = auth_client.post(
        reverse("tasa-cambio-list"),
        {"moneda": "VES", "tasa": "40.5"},
        format="json",
    )

    assert response.status_code == 403


def test_tasa_invalida_es_rechazada(admin_client, empresa):
    response = admin_client.post(
        reverse("tasa-cambio-list"),
        {"moneda": "VES", "tasa": "0"},
        format="json",
    )

    assert response.status_code == 400
