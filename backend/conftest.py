"""Fixtures compartidas de pytest."""

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework.test import APIClient

User = get_user_model()


@pytest.fixture(autouse=True)
def _clear_cache():
    """Evita que el throttling de login se acumule entre tests."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email="vendedor@example.com",
        password="ClaveSegura123!",
        nombre="Vendedor de Prueba",
        rol="vendedor",
    )


@pytest.fixture
def admin_user(db):
    return User.objects.create_superuser(
        email="admin@example.com",
        password="ClaveSegura123!",
        nombre="Administrador de Prueba",
    )


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def admin_site_client(admin_user):
    """Cliente con sesión iniciada en el admin de Django (no la API)."""
    from django.test import Client

    client = Client()
    assert client.login(email=admin_user.email, password="ClaveSegura123!")
    return client


@pytest.fixture
def cobrador_client(db):
    user = User.objects.create_user(
        email="cobrador@example.com",
        password="ClaveSegura123!",
        nombre="Cobrador de Prueba",
        rol="cobrador",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def almacenista_client(db):
    user = User.objects.create_user(
        email="almacenista@example.com",
        password="ClaveSegura123!",
        nombre="Almacenista de Prueba",
        rol="almacenista",
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def empresa(db):
    from apps.company.models import Empresa

    return Empresa.objects.create(
        razon_social="Empresa de Prueba, C.A.",
        nombre_comercial="Empresa de Prueba",
        rif="J-12345678-9",
    )


@pytest.fixture
def categoria(db):
    from apps.inventory.models import CategoriaProducto

    return CategoriaProducto.objects.create(nombre="General")


@pytest.fixture
def unidad(db):
    from apps.inventory.models import UnidadMedida

    return UnidadMedida.objects.create(nombre="Unidad", abreviatura="UND")


@pytest.fixture
def producto(db, categoria, unidad):
    from decimal import Decimal

    from apps.inventory.models import Producto

    return Producto.objects.create(
        sku="PROD-001",
        nombre="Producto de Prueba",
        categoria=categoria,
        unidad=unidad,
        costo=Decimal("10.00"),
        precio=Decimal("15.00"),
        stock=Decimal("0.000"),
    )


@pytest.fixture
def cliente(db):
    from apps.clients.models import Cliente

    return Cliente.objects.create(
        codigo="CL-00001",
        nombre="Cliente de Prueba",
        rif_cedula="V-12345678",
        telefono="+584141234567",
        email="cliente@example.com",
        direccion="Caracas",
    )


@pytest.fixture
def proveedor(db):
    from apps.clients.models import Proveedor

    return Proveedor.objects.create(
        codigo="PR-00001",
        nombre="Proveedor de Prueba",
        rif="J-98765432-1",
    )
