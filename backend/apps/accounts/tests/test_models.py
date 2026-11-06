"""Tests del modelo de usuario."""

import pytest
from django.contrib.auth import get_user_model

from apps.accounts.models import Rol

User = get_user_model()


@pytest.mark.django_db
def test_create_user_normaliza_email_y_asigna_rol_por_defecto():
    user = User.objects.create_user(
        email="Vendedor@Example.COM",
        password="ClaveSegura123!",
        nombre="Vendedor",
    )

    assert user.email == "vendedor@example.com"
    assert user.rol == Rol.VENDEDOR
    assert user.is_active is True
    assert user.check_password("ClaveSegura123!") is True


@pytest.mark.django_db
def test_create_superuser_asigna_rol_admin_y_permisos():
    user = User.objects.create_superuser(
        email="admin@example.com",
        password="ClaveSegura123!",
        nombre="Admin",
    )

    assert user.rol == Rol.ADMIN
    assert user.is_staff is True
    assert user.is_superuser is True
    assert user.is_admin is True
    assert user.puede_ver_costos is True


@pytest.mark.django_db
def test_email_es_obligatorio():
    with pytest.raises(ValueError):
        User.objects.create_user(email="", password="ClaveSegura123!", nombre="Sin email")
