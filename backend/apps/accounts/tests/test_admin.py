"""Tests de la alta y edición de usuarios desde el admin de Django."""

import pytest
from django.contrib.auth import get_user_model
from django.urls import reverse

pytestmark = pytest.mark.django_db

User = get_user_model()


def _post_add_user(client, **overrides):
    data = {
        "email": "maria.perez@empresa.com",
        "nombre": "María Pérez",
        "telefono": "+584141234567",
        "rol": "vendedor",
        "password1": "ClaveSegura123!",
        "password2": "ClaveSegura123!",
        "must_change_password": "on",
        # Management forms del inline de correos adicionales (el navegador
        # los envía siempre, aunque no se agregue ninguno).
        "correos_adicionales-TOTAL_FORMS": "0",
        "correos_adicionales-INITIAL_FORMS": "0",
        "correos_adicionales-MIN_NUM_FORMS": "0",
        "correos_adicionales-MAX_NUM_FORMS": "1000",
    }
    data.update(overrides)
    return client.post(reverse("admin:accounts_user_add"), data)


def test_admin_crea_usuario_con_otro_correo(admin_site_client):
    response = _post_add_user(admin_site_client)
    assert response.status_code == 302

    nuevo = User.objects.get(email="maria.perez@empresa.com")
    assert nuevo.rol == "vendedor"
    assert nuevo.is_active is True
    assert nuevo.is_staff is False
    assert nuevo.check_password("ClaveSegura123!")
    assert nuevo.must_change_password is True


def test_admin_normaliza_correo_a_minusculas(admin_site_client):
    _post_add_user(admin_site_client, email="JUAN.GARCIA@Empresa.COM")

    assert User.objects.filter(email="juan.garcia@empresa.com").exists()
    assert (
        not User.objects.exclude(email="juan.garcia@empresa.com")
        .filter(email__iexact="juan.garcia@empresa.com")
        .exists()
    )


def test_admin_rechaza_correo_duplicado(admin_site_client, user):
    response = _post_add_user(admin_site_client, email=user.email.upper())
    assert response.status_code == 200
    assert "email" in response.context["adminform"].errors


def test_admin_rechaza_passwords_distintas(admin_site_client):
    response = _post_add_user(admin_site_client, password2="Distinta123!")
    assert response.status_code == 200
    assert "password2" in response.context["adminform"].errors


@pytest.mark.parametrize("password", ["123", "corta", "password123"])
def test_admin_rechaza_password_que_no_cumple_la_politica(admin_site_client, password):
    response = _post_add_user(admin_site_client, password1=password, password2=password)
    assert response.status_code == 200
    assert "password2" in response.context["adminform"].errors
    assert not User.objects.filter(email="maria.perez@empresa.com").exists()


def test_admin_acepta_password_que_cumple_la_politica(admin_site_client):
    response = _post_add_user(admin_site_client)
    assert response.status_code == 302
    assert User.objects.filter(email="maria.perez@empresa.com").exists()


def test_admin_puede_crear_usuario_sin_exigir_cambio_de_password(admin_site_client):
    response = _post_add_user(admin_site_client, must_change_password="")
    assert response.status_code == 302

    nuevo = User.objects.get(email="maria.perez@empresa.com")
    assert nuevo.must_change_password is False


def test_usuario_creado_por_admin_puede_hacer_login(api_client, admin_site_client):
    _post_add_user(admin_site_client, must_change_password="")

    response = api_client.post(
        reverse("login"),
        {"email": "maria.perez@empresa.com", "password": "ClaveSegura123!"},
        format="json",
    )
    assert response.status_code == 200
    assert response.data["user"]["email"] == "maria.perez@empresa.com"
