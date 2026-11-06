"""Vistas de empresa y tasas de cambio."""

from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import (
    IsAdmin,
    IsAdminForInitialSetup,
    IsAuthenticatedAndCompanyReady,
)

from .models import TasaCambio
from .serializers import EmpresaSerializer, TasaCambioSerializer
from .services import get_empresa, get_tasa_vigente, upsert_empresa


class EmpresaView(APIView):
    """Configuración fiscal de la empresa (singleton)."""

    serializer_class = EmpresaSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [IsAuthenticated()]
        # Primer arranque: el admin puede crear la empresa aunque todavía
        # tenga la contraseña temporal. Después de crearla, se exige cambiarla.
        if get_empresa() is None:
            return [IsAdminForInitialSetup()]
        return [IsAdmin()]

    @extend_schema(responses=EmpresaSerializer)
    def get(self, request):
        empresa = get_empresa()
        if empresa is None:
            return Response(
                {
                    "detail": "La empresa aún no está configurada.",
                    "code": "company_not_configured",
                    "errors": {},
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(EmpresaSerializer(empresa, context={"request": request}).data)

    @extend_schema(request=EmpresaSerializer, responses=EmpresaSerializer)
    def put(self, request):
        return self._save(request, partial=False)

    @extend_schema(request=EmpresaSerializer, responses=EmpresaSerializer)
    def patch(self, request):
        return self._save(request, partial=True)

    def _save(self, request, partial: bool):
        empresa = get_empresa()
        creada = empresa is None
        serializer = EmpresaSerializer(
            empresa,
            data=request.data,
            partial=partial,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        empresa = upsert_empresa(serializer.validated_data, request.user)
        return Response(
            EmpresaSerializer(empresa, context={"request": request}).data,
            status=status.HTTP_201_CREATED if creada else status.HTTP_200_OK,
        )


class TasaCambioViewSet(viewsets.ModelViewSet):
    """Histórico de tasas. Solo el admin puede crear o modificar."""

    queryset = TasaCambio.objects.all()
    serializer_class = TasaCambioSerializer
    filterset_fields = ("moneda", "fuente")
    ordering_fields = ("vigente_desde", "tasa")
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update"):
            return [IsAuthenticatedAndCompanyReady(), IsAdmin()]
        # Las acciones de lectura usan el permiso global (incluye el gate fiscal).
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=["get"], url_path="vigente")
    def vigente(self, request):
        moneda = request.query_params.get("moneda", "VES")
        tasa = get_tasa_vigente(moneda)
        if tasa is None:
            return Response(
                {
                    "detail": f"No hay tasa configurada para {moneda.upper()}.",
                    "code": "tasa_no_configurada",
                    "errors": {},
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(self.get_serializer(tasa).data)
