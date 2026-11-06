"""Vistas de clientes y proveedores."""

from rest_framework import viewsets

from apps.common.permissions import IsAuthenticatedAndCompanyReady, RoleBasedAccess

from .models import Cliente, Proveedor
from .serializers import ClienteSerializer, ProveedorSerializer


class ClienteAccess(RoleBasedAccess):
    read_roles = ("admin", "vendedor", "cobrador")
    write_roles = ("admin", "vendedor")


class ProveedorAccess(RoleBasedAccess):
    read_roles = ("admin", "almacenista")
    write_roles = ("admin", "almacenista")


class ClienteViewSet(viewsets.ModelViewSet):
    """Clientes. El cobrador puede consultarlos, pero no modificarlos."""

    queryset = Cliente.objects.all()
    serializer_class = ClienteSerializer
    permission_classes = (IsAuthenticatedAndCompanyReady, ClienteAccess)
    filterset_fields = ("activo",)
    search_fields = ("codigo", "nombre", "rif_cedula", "telefono", "email")
    ordering_fields = ("codigo", "nombre", "created_at")
    ordering = ("nombre",)
    http_method_names = ["get", "post", "put", "patch", "head", "options"]


class ProveedorViewSet(viewsets.ModelViewSet):
    """Proveedores. Solo administración y almacén."""

    queryset = Proveedor.objects.all()
    serializer_class = ProveedorSerializer
    permission_classes = (IsAuthenticatedAndCompanyReady, ProveedorAccess)
    filterset_fields = ("activo",)
    search_fields = ("codigo", "nombre", "rif", "telefono", "email")
    ordering_fields = ("codigo", "nombre", "created_at")
    ordering = ("nombre",)
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
