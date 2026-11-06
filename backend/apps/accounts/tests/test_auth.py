"""Tests de autenticación JWT."""

import pytest
from django.conf import settings
from django.urls import reverse

pytestmark = pytest.mark.django_db


def _login(client, email, password="ClaveSegura123!"):
    return client.post(
        reverse("login"),
        {"email": email, "password": password},
        format="json",
    )


def test_login_devuelve_access_y_cookie_de_refresh(api_client, user):
    response = _login(api_client, user.email)

    assert response.status_code == 200
    assert "access" in response.data
    assert "refresh" not in response.data
    assert response.data["user"]["email"] == user.email
    assert settings.REFRESH_COOKIE_NAME in response.cookies


def test_login_con_password_incorrecta_falla(api_client, user):
    response = _login(api_client, user.email, "PasswordIncorrecta123!")

    assert response.status_code == 401


def test_me_requiere_autenticacion(api_client):
    response = api_client.get(reverse("me"))

    assert response.status_code == 401


def test_me_devuelve_perfil_autenticado(api_client, user):
    access = _login(api_client, user.email).data["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    response = api_client.get(reverse("me"))

    assert response.status_code == 200
    assert response.data["email"] == user.email
    assert response.data["rol"] == "vendedor"


def test_refresh_rota_el_token(api_client, user):
    login = _login(api_client, user.email)
    old_refresh = login.cookies[settings.REFRESH_COOKIE_NAME].value

    response = api_client.post(reverse("token-refresh"))

    assert response.status_code == 200
    assert "access" in response.data
    new_refresh = response.cookies[settings.REFRESH_COOKIE_NAME].value
    assert new_refresh != old_refresh


def test_logout_revoca_el_refresh(api_client, user):
    _login(api_client, user.email)

    logout = api_client.post(reverse("logout"))
    assert logout.status_code == 204

    response = api_client.post(reverse("token-refresh"))
    assert response.status_code == 401


def test_cambio_de_password(api_client, user):
    access = _login(api_client, user.email).data["access"]
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    response = api_client.post(
        reverse("change-password"),
        {
            "current_password": "ClaveSegura123!",
            "new_password": "NuevaClaveSegura123!",
        },
        format="json",
    )

    assert response.status_code == 200
    assert user.must_change_password is False

    api_client.credentials()
    assert _login(api_client, user.email).status_code == 401
    assert _login(api_client, user.email, "NuevaClaveSegura123!").status_code == 200


def test_health_es_publico(api_client):
    response = api_client.get(reverse("health"))

    assert response.status_code == 200
    assert response.data == {"status": "ok"}
