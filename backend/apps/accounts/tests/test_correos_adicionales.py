"""Tests de correos adicionales de inicio de sesión."""

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import Client
from django.urls import reverse

from apps.accounts.models import UserEmailAdicional

pytestmark = pytest.mark.django_db

User = get_user_model()


def _agregar_correo(user, email):
    adicional = UserEmailAdicional(user=user, email=email)
    adicional.full_clean()
    adicional.save()
    return adicional


def _login_api(client, email, password="ClaveSegura123!"):
    return client.post(reverse("login"), {"email": email, "password": password}, format="json")


def test_login_con_correo_adicional(api_client, user):
    _agregar_correo(user, "alterno@empresa.com")

    response = _login_api(api_client, "alterno@empresa.com")

    assert response.status_code == 200
    assert response.data["user"]["email"] == user.email


def test_login_con_correo_adicional_ignora_mayusculas(api_client, user):
    _agregar_correo(user, "alterno@empresa.com")

    response = _login_api(api_client, "Alterno@Empresa.COM")

    assert response.status_code == 200


def test_login_con_correo_principal_ignora_mayusculas(api_client, user):
    response = _login_api(api_client, "VENDEDOR@example.com")

    assert response.status_code == 200


def test_login_con_correo_adicional_y_password_incorrecta_falla(api_client, user):
    _agregar_correo(user, "alterno@empresa.com")

    response = _login_api(api_client, "alterno@empresa.com", "PasswordMala123!")

    assert response.status_code == 401


def test_usuario_inactivo_no_entra_con_correo_adicional(api_client, user):
    _agregar_correo(user, "alterno@empresa.com")
    user.is_active = False
    user.save(update_fields=["is_active"])

    response = _login_api(api_client, "alterno@empresa.com")

    assert response.status_code == 401


def test_login_exitoso_marca_correo_adicional_verificado(user):
    _agregar_correo(user, "alterno@empresa.com")

    client = Client()
    assert client.login(email="alterno@empresa.com", password="ClaveSegura123!")

    adicional = UserEmailAdicional.objects.get(email="alterno@empresa.com")
    assert adicional.is_verified is True


def test_login_fallido_no_marca_correo_adicional_verificado(user):
    _agregar_correo(user, "alterno@empresa.com")

    client = Client()
    assert not client.login(email="alterno@empresa.com", password="PasswordMala123!")

    adicional = UserEmailAdicional.objects.get(email="alterno@empresa.com")
    assert adicional.is_verified is False


def test_correo_adicional_no_puede_ser_principal_de_otro_usuario(user):
    otro = User.objects.create_user(
        email="otro@empresa.com",
        password="ClaveSegura123!",
        nombre="Otro Usuario",
    )

    with pytest.raises(ValidationError):
        _agregar_correo(user, otro.email.upper())


def test_correo_adicional_es_unico_entre_usuarios(user):
    _agregar_correo(user, "alterno@empresa.com")
    otro = User.objects.create_user(
        email="otro@empresa.com",
        password="ClaveSegura123!",
        nombre="Otro Usuario",
    )

    with pytest.raises(ValidationError):
        _agregar_correo(otro, "Alterno@Empresa.com")


def test_admin_agrega_correo_adicional_desde_el_detalle_del_usuario(
    admin_site_client, user, admin_user
):
    url = reverse("admin:accounts_user_change", args=[user.pk])
    data = {
        "email": user.email,
        "nombre": user.nombre,
        "telefono": "",
        "rol": user.rol,
        "is_active": "on",
        "correos_adicionales-TOTAL_FORMS": "1",
        "correos_adicionales-INITIAL_FORMS": "0",
        "correos_adicionales-MIN_NUM_FORMS": "0",
        "correos_adicionales-MAX_NUM_FORMS": "1000",
        "correos_adicionales-0-user": str(user.pk),
        "correos_adicionales-0-email": "Alterno@Empresa.com",
    }

    response = admin_site_client.post(url, data)

    assert response.status_code == 302, response.context["adminform"].errors
    adicional = user.correos_adicionales.get()
    assert adicional.email == "alterno@empresa.com"
    assert adicional.created_by == admin_user


def test_admin_rechaza_correo_adicional_duplicado(admin_site_client, user):
    _agregar_correo(user, "alterno@empresa.com")
    otro = User.objects.create_user(
        email="otro@empresa.com",
        password="ClaveSegura123!",
        nombre="Otro Usuario",
    )

    url = reverse("admin:accounts_user_change", args=[otro.pk])
    data = {
        "email": otro.email,
        "nombre": otro.nombre,
        "telefono": "",
        "rol": otro.rol,
        "is_active": "on",
        "correos_adicionales-TOTAL_FORMS": "1",
        "correos_adicionales-INITIAL_FORMS": "0",
        "correos_adicionales-MIN_NUM_FORMS": "0",
        "correos_adicionales-MAX_NUM_FORMS": "1000",
        "correos_adicionales-0-user": str(otro.pk),
        "correos_adicionales-0-email": "alterno@empresa.com",
    }

    response = admin_site_client.post(url, data)

    assert response.status_code == 200
    assert otro.correos_adicionales.count() == 0
