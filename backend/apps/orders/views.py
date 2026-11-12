"""Vistas de pedidos de venta."""

from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.common.permissions import (
    IsAdmin,
    IsAuthenticatedAndCompanyReady,
    RoleBasedAccess,
)

from .models import Pedido
from .serializers import (
    AnularPedidoSerializer,
    ConfirmarPedidoSerializer,
    EntregarPedidoSerializer,
    PedidoSerializer,
)


class PedidoAccess(RoleBasedAccess):
    """Pedidos: lectura para admin, vendedor y cobrador;
    escritura para admin y vendedor; anulación solo admin; entrega admin + almacenista."""

    read_roles = ("admin", "vendedor", "cobrador")
    write_roles = ("admin", "vendedor")


class PedidoFilter(filters.FilterSet):
    fecha_desde = filters.DateFilter(field_name="fecha", lookup_expr="gte")
    fecha_hasta = filters.DateFilter(field_name="fecha", lookup_expr="lte")

    class Meta:
        model = Pedido
        fields = ("cliente", "estado", "tipo_pago", "moneda")


class PedidoViewSet(viewsets.ModelViewSet):
    """Pedidos de venta. El stock se descuenta al confirmar, no al crear."""

    queryset = (
        Pedido.objects.select_related("cliente", "created_by", "anulado_por")
        .prefetch_related("detalles__producto__unidad", "detalles__combo")
        .all()
    )
    serializer_class = PedidoSerializer
    permission_classes = (IsAuthenticatedAndCompanyReady, PedidoAccess)
    filterset_class = PedidoFilter
    search_fields = ("numero", "cliente__nombre", "cliente__codigo", "notas")
    ordering_fields = ("numero", "fecha", "total", "created_at")
    ordering = ("-fecha", "-numero")
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def get_permissions(self):
        """Anulación solo para admin; el resto usa PedidoAccess."""
        if self.action == "anular":
            return [IsAuthenticatedAndCompanyReady(), IsAdmin()]
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"])
    def confirmar(self, request, pk=None):
        pedido = self.get_object()
        serializer = ConfirmarPedidoSerializer(
            data={}, context={"request": request, "pedido": pedido}
        )
        serializer.is_valid(raise_exception=True)
        pedido = serializer.save()
        return Response(self.get_serializer(pedido).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def anular(self, request, pk=None):
        pedido = self.get_object()
        serializer = AnularPedidoSerializer(
            data=request.data, context={"request": request, "pedido": pedido}
        )
        serializer.is_valid(raise_exception=True)
        pedido = serializer.save()
        return Response(self.get_serializer(pedido).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"])
    def entregar(self, request, pk=None):
        pedido = self.get_object()
        serializer = EntregarPedidoSerializer(
            data={}, context={"request": request, "pedido": pedido}
        )
        serializer.is_valid(raise_exception=True)
        pedido = serializer.save()
        return Response(self.get_serializer(pedido).data, status=status.HTTP_200_OK)
