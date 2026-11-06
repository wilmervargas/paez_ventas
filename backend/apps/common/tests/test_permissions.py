"""Tests del gate global de permisos."""

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

pytestmark = pytest.mark.django_db

User = get_user_model()


def _temporal_user():
    return User.objects.create_user(
        email="temporal@example.com",
        password="ClaveSegura123!",
        nombre="Usuario Temporal",
        rol="vendedor",
        must_change_password=True,
    )


def test_password_temporal_bloquea_operaciones(api_client, empresa):
    api_client.force_authenticate(user=_temporal_user())

    response = api_client.get(reverse("tasa-cambio-list"))

    assert response.status_code == 403
    assert response.data["code"] == "password_change_required"


def test_admin_temporal_configura_empresa_inicial(api_client):
    """Sin empresa configurada, el admin puede crearla antes de cambiar la clave."""
    user = User.objects.create_user(
        email="admin-inicial@example.com",
        password="ClaveSegura123!",
        nombre="Admin Inicial",
        rol="admin",
        must_change_password=True,
    )
    api_client.force_authenticate(user=user)

    response = api_client.put(
        reverse("empresa"),
        {
            "razon_social": "Empresa Inicial, C.A.",
            "rif": "J-11111111-1",
            "moneda_base": "USD",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["razon_social"] == "Empresa Inicial, C.A."


def test_admin_temporal_no_puede_editar_empresa_existente(api_client, empresa):
    user = User.objects.create_user(
        email="admin-temporal@example.com",
        password="ClaveSegura123!",
        nombre="Admin Temporal",
        rol="admin",
        must_change_password=True,
    )
    api_client.force_authenticate(user=user)

    response = api_client.put(
        reverse("empresa"),
        {"razon_social": "No permitido", "rif": "J-00000000-0"},
        format="json",
    )

    assert response.status_code == 403
    assert response.data["code"] == "password_change_required"


def test_tras_cambiar_password_se_libera_el_acceso(api_client, empresa):
    user = _temporal_user()
    api_client.force_authenticate(user=user)

    assert api_client.get(reverse("tasa-cambio-list")).status_code == 403

    user.must_change_password = False
    user.save(update_fields=["must_change_password"])

    assert api_client.get(reverse("tasa-cambio-list")).status_code == 200
