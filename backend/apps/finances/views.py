"""Vistas del módulo de finanzas."""

from django_filters import rest_framework as filters
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsAdmin, IsAuthenticatedAndCompanyReady, RoleBasedAccess

from .models import CajaSesion, Deuda, Pago
from .serializers import (
    AbrirCajaSerializer,
    AnularPagoSerializer,
    CajaSesionSerializer,
    CerrarCajaSerializer,
    DeudaSerializer,
    PagoSerializer,
)
from .services import get_caja_abierta
from .whatsapp import enviar_whatsapp, estado_whatsapp, resumen_cobro


class FinanzasReadCobroAccess(RoleBasedAccess):
    # lectura: admin, vendedor, cobrador (deudas/cartera); escritura limitada por acción
    read_roles = ("admin", "vendedor", "cobrador")
    write_roles = ("admin", "cobrador")


class DeudaFilter(filters.FilterSet):
    pendiente = filters.BooleanFilter(method="filter_pendiente")
    vencida = filters.BooleanFilter(method="filter_vencida")

    class Meta:
        model = Deuda
        fields = ("cliente", "estado", "moneda")

    def filter_pendiente(self, qs, name, value):
        if value:
            return qs.filter(estado=Deuda.Estado.PENDIENTE, saldo__gt=0)
        return qs

    def filter_vencida(self, qs, name, value):
        if value:
            from django.utils import timezone

            return qs.filter(
                estado=Deuda.Estado.PENDIENTE,
                saldo__gt=0,
                fecha_vencimiento__lt=timezone.localdate(),
            )
        return qs


class DeudaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = (
        Deuda.objects.select_related("cliente", "pedido")
        .prefetch_related("cuotas", "aplicaciones")
        .all()
    )
    serializer_class = DeudaSerializer
    permission_classes = (IsAuthenticatedAndCompanyReady, FinanzasReadCobroAccess)
    filterset_class = DeudaFilter
    search_fields = ("pedido__numero", "cliente__nombre", "cliente__codigo")
    ordering_fields = ("fecha_emision", "fecha_vencimiento", "saldo")
    ordering = ("-fecha_emision", "-id")

    @action(detail=False, methods=["get"], url_path="pendientes")
    def pendientes(self, request):
        qs = self.filter_queryset(
            self.get_queryset().filter(estado=Deuda.Estado.PENDIENTE, saldo__gt=0)
        )
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(self.get_serializer(page, many=True).data)
        return Response(self.get_serializer(qs, many=True).data)

    @action(detail=True, methods=["get"], url_path="mensaje-cobro")
    def mensaje_cobro(self, request, pk=None):
        """Vista previa del mensaje con las deudas y pagos del cliente."""
        deuda = self.get_object()
        return Response(resumen_cobro(deuda))

    @action(detail=True, methods=["post"], url_path="enviar-cobro")
    def enviar_cobro(self, request, pk=None):
        """Envía el mensaje de cobro al WhatsApp del cliente (acción explícita)."""
        deuda = self.get_object()
        resumen = resumen_cobro(deuda, mensaje=request.data.get("mensaje"))
        resultado = enviar_whatsapp(resumen["telefono"], resumen["mensaje"])
        return Response({**resultado, "cliente": resumen["cliente"]["nombre"]})


class PagoViewSet(viewsets.ModelViewSet):
    queryset = Pago.objects.select_related("cliente", "created_by", "caja_sesion").prefetch_related(
        "aplicaciones__cuota"
    )
    serializer_class = PagoSerializer
    permission_classes = (IsAuthenticatedAndCompanyReady, FinanzasReadCobroAccess)
    filterset_fields = ("cliente", "metodo", "anulado", "moneda")
    search_fields = ("numero", "cliente__nombre", "referencia", "telefono_origen")
    ordering_fields = ("fecha_pago", "monto", "created_at")
    ordering = ("-fecha_pago", "-id")
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        if self.action == "anular":
            return [IsAuthenticatedAndCompanyReady(), IsAdmin()]
        return super().get_permissions()

    @action(detail=True, methods=["post"])
    def anular(self, request, pk=None):
        pago = self.get_object()
        serializer = AnularPagoSerializer(
            data=request.data, context={"request": request, "pago": pago}
        )
        serializer.is_valid(raise_exception=True)
        pago = serializer.save()
        return Response(self.get_serializer(pago).data, status=status.HTTP_200_OK)


class WhatsAppEstadoView(APIView):
    """Estado de la sesión del servidor local de WhatsApp (`ws/server`)."""

    permission_classes = (IsAuthenticatedAndCompanyReady, FinanzasReadCobroAccess)

    def get(self, request):
        return Response(estado_whatsapp())


class CajaActualView(APIView):
    permission_classes = (IsAuthenticatedAndCompanyReady, FinanzasReadCobroAccess)

    def get(self, request):
        sesion = get_caja_abierta(request.user)
        if not sesion:
            return Response(
                {"detail": "No hay caja abierta.", "abierta": False}, status=status.HTTP_200_OK
            )
        return Response({"abierta": True, "sesion": CajaSesionSerializer(sesion).data})


class CajaSesionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CajaSesion.objects.select_related(
        "usuario_apertura", "usuario_cierre"
    ).prefetch_related("movimientos")
    serializer_class = CajaSesionSerializer
    permission_classes = (IsAuthenticatedAndCompanyReady, FinanzasReadCobroAccess)
    filterset_fields = ("estado", "usuario_apertura")
    ordering = ("-fecha_apertura", "-id")

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if getattr(user, "rol", None) != "admin":
            qs = qs.filter(usuario_apertura=user)
        return qs

    @action(detail=False, methods=["post"], url_path="abrir")
    def abrir(self, request):
        serializer = AbrirCajaSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        sesion = serializer.save()
        return Response(CajaSesionSerializer(sesion).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="cerrar")
    def cerrar(self, request, pk=None):
        sesion = self.get_object()
        serializer = CerrarCajaSerializer(
            data=request.data, context={"request": request, "sesion": sesion}
        )
        serializer.is_valid(raise_exception=True)
        sesion = serializer.save()
        return Response(CajaSesionSerializer(sesion).data, status=status.HTTP_200_OK)
