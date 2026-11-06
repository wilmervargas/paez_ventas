"""Vistas de compras y recepción de mercancía."""

from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.permissions import IsAuthenticatedAndCompanyReady, RoleBasedAccess

from .models import Compra
from .serializers import (
    AnularCompraSerializer,
    CompraSerializer,
    RecibirCompraSerializer,
)


class CompraAccess(RoleBasedAccess):
    """Compras visibles y gestionables por administración y almacén."""

    read_roles = ("admin", "almacenista")
    write_roles = ("admin", "almacenista")


class CompraFilter(filters.FilterSet):
    fecha_desde = filters.DateFilter(field_name="fecha", lookup_expr="gte")
    fecha_hasta = filters.DateFilter(field_name="fecha", lookup_expr="lte")

    class Meta:
        model = Compra
        fields = ("proveedor", "estado", "moneda")


class CompraViewSet(viewsets.ModelViewSet):
    """Compras. No se eliminan: se anulan con reverso de inventario."""

    queryset = (
        Compra.objects.select_related("proveedor", "created_by", "anulado_por")
        .prefetch_related("detalles__producto__unidad")
        .all()
    )
    serializer_class = CompraSerializer
    permission_classes = (IsAuthenticatedAndCompanyReady, CompraAccess)
    filterset_class = CompraFilter
    search_fields = ("numero", "proveedor__nombre", "proveedor__rif", "notas")
    ordering_fields = ("numero", "fecha", "total", "created_at")
    ordering = ("-fecha", "-numero")
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    @action(detail=True, methods=["post"])
    def recibir(self, request, pk=None):
        compra = self.get_object()
        serializer = RecibirCompraSerializer(
            data={},
            context={"request": request, "compra": compra},
        )
        serializer.is_valid(raise_exception=True)
        compra = serializer.save()
        return Response(self.get_serializer(compra).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def anular(self, request, pk=None):
        compra = self.get_object()
        serializer = AnularCompraSerializer(
            data=request.data,
            context={"request": request, "compra": compra},
        )
        serializer.is_valid(raise_exception=True)
        compra = serializer.save()
        return Response(self.get_serializer(compra).data, status=status.HTTP_200_OK)
