"""Vistas del catálogo y del kardex de inventario."""

from django.db.models import F
from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import CreateAPIView
from rest_framework.response import Response

from apps.common.permissions import (
    IsAdminOrReadOnly,
    IsAlmacenista,
    IsAuthenticatedAndCompanyReady,
    RoleBasedAccess,
)

from .models import (
    CategoriaProducto,
    Combo,
    MovimientoInventario,
    Producto,
    UnidadMedida,
)
from .serializers import (
    AjusteInventarioSerializer,
    CategoriaProductoSerializer,
    ComboSerializer,
    MovimientoInventarioSerializer,
    ProductoSerializer,
    UnidadMedidaSerializer,
)


class CatalogoAccess(RoleBasedAccess):
    """Catálogo visible para ventas y almacén; escritura solo administración."""

    read_roles = ("admin", "vendedor", "almacenista")
    write_roles = ("admin",)


class InventarioLecturaAccess(RoleBasedAccess):
    read_roles = ("admin", "vendedor", "almacenista")
    write_roles = ()


class MovimientoFilter(filters.FilterSet):
    fecha_desde = filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    fecha_hasta = filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = MovimientoInventario
        fields = ("producto", "tipo", "direccion")


class ProductoViewSet(viewsets.ModelViewSet):
    queryset = Producto.objects.select_related("categoria", "unidad").all()
    serializer_class = ProductoSerializer
    permission_classes = (IsAuthenticatedAndCompanyReady, CatalogoAccess)
    filterset_fields = ("categoria", "unidad", "activo", "iva_aplicable")
    search_fields = ("sku", "nombre")
    ordering_fields = ("sku", "nombre", "precio", "stock", "created_at")
    ordering = ("nombre",)
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    @action(detail=False, methods=["get"], url_path="stock-bajo")
    def stock_bajo(self, request):
        queryset = self.get_queryset().filter(activo=True, stock__lte=F("stock_minimo"))
        page = self.paginate_queryset(queryset)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=True, methods=["get"])
    def kardex(self, request, pk=None):
        producto = self.get_object()
        queryset = producto.movimientos.select_related("created_by").all()
        page = self.paginate_queryset(queryset)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(self.get_serializer(queryset, many=True).data)


class ComboViewSet(viewsets.ModelViewSet):
    queryset = Combo.objects.prefetch_related("componentes__producto__unidad").all()
    serializer_class = ComboSerializer
    permission_classes = (IsAuthenticatedAndCompanyReady, CatalogoAccess)
    filterset_fields = ("activo",)
    search_fields = ("sku", "nombre")
    ordering_fields = ("sku", "nombre", "precio", "created_at")
    ordering = ("nombre",)
    http_method_names = ["get", "post", "put", "patch", "head", "options"]


class CategoriaProductoViewSet(viewsets.ModelViewSet):
    queryset = CategoriaProducto.objects.all()
    serializer_class = CategoriaProductoSerializer
    permission_classes = (IsAuthenticatedAndCompanyReady, IsAdminOrReadOnly)
    filterset_fields = ("activo",)
    search_fields = ("nombre",)
    ordering = ("nombre",)
    http_method_names = ["get", "post", "put", "patch", "head", "options"]


class UnidadMedidaViewSet(viewsets.ModelViewSet):
    queryset = UnidadMedida.objects.all()
    serializer_class = UnidadMedidaSerializer
    permission_classes = (IsAuthenticatedAndCompanyReady, IsAdminOrReadOnly)
    search_fields = ("nombre", "abreviatura")
    ordering = ("nombre",)
    http_method_names = ["get", "post", "put", "patch", "head", "options"]


class MovimientoInventarioViewSet(viewsets.ReadOnlyModelViewSet):
    """Kardex inmutable: solo lectura. Los cambios se hacen por ajustes."""

    queryset = MovimientoInventario.objects.select_related("producto", "created_by").all()
    serializer_class = MovimientoInventarioSerializer
    permission_classes = (IsAuthenticatedAndCompanyReady, InventarioLecturaAccess)
    filterset_class = MovimientoFilter
    search_fields = ("producto__sku", "producto__nombre", "motivo", "referencia_tipo")
    ordering_fields = ("created_at", "cantidad")
    ordering = ("-created_at",)
    http_method_names = ["get", "head", "options"]


class AjusteInventarioView(CreateAPIView):
    """Registra un ajuste manual de stock (entrada o salida)."""

    serializer_class = AjusteInventarioSerializer
    permission_classes = (IsAuthenticatedAndCompanyReady, IsAlmacenista)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        movimiento = serializer.save()
        salida = MovimientoInventarioSerializer(
            movimiento,
            context={"request": request},
        )
        return Response(salida.data, status=status.HTTP_201_CREATED)
