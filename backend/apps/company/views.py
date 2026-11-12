"""Vistas de empresa y tasas de cambio."""

from datetime import datetime

from django.utils import timezone
from django_filters import rest_framework as filters
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
from .serializers import EmpresaSerializer, ResumenTasaSerializer, TasaCambioSerializer
from .services import (
    get_empresa,
    get_resumen_tasas,
    get_tasa_del_dia,
    upsert_empresa,
)


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


class TasaCambioFilter(filters.FilterSet):
    fecha = filters.DateFilter(field_name="vigente_desde", lookup_expr="date")
    desde = filters.DateFilter(field_name="vigente_desde", lookup_expr="date__gte")
    hasta = filters.DateFilter(field_name="vigente_desde", lookup_expr="date__lte")

    class Meta:
        model = TasaCambio
        fields = ("moneda", "moneda_base", "fuente", "fecha", "desde", "hasta")


class TasaCambioViewSet(viewsets.ModelViewSet):
    """Histórico de tasas. Solo el admin puede crear o modificar."""

    queryset = TasaCambio.objects.select_related("created_by").all()
    serializer_class = TasaCambioSerializer
    filterset_class = TasaCambioFilter
    ordering_fields = ("vigente_desde", "tasa", "moneda_base")
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update"):
            return [IsAuthenticatedAndCompanyReady(), IsAdmin()]
        # Las acciones de lectura usan el permiso global (incluye el gate fiscal).
        return super().get_permissions()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @extend_schema(
        parameters=[
            {"name": "moneda", "type": "str"},
            {"name": "base", "type": "str"},
            {"name": "fecha", "type": "date"},
        ]
    )
    @action(detail=False, methods=["get"], url_path="vigente")
    def vigente(self, request):
        """Tasa aplicable a una fecha (default hoy).

        Si ese día no tiene tasa, se arrastra la última anterior conocida.
        Si el par no está registrado, se deriva por cruce con el bolívar.
        """
        moneda = request.query_params.get("moneda", "VES")
        base = request.query_params.get("base") or None
        fecha_param = request.query_params.get("fecha")

        fecha = None
        if fecha_param:
            try:
                fecha = datetime.strptime(fecha_param, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {
                        "detail": "La fecha debe tener formato YYYY-MM-DD.",
                        "code": "fecha_invalida",
                        "errors": {"fecha": ["Formato inválido."]},
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        tasa = get_tasa_del_dia(moneda, fecha, base=base)
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

    @extend_schema(parameters=[{"name": "fecha", "type": "date"}], responses=ResumenTasaSerializer)
    @action(detail=False, methods=["get"], url_path="resumen")
    def resumen(self, request):
        """Última tasa en bolívares de USD, EUR y USDT para la fecha indicada."""
        fecha_param = request.query_params.get("fecha")
        fecha = None
        if fecha_param:
            try:
                fecha = datetime.strptime(fecha_param, "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {
                        "detail": "La fecha debe tener formato YYYY-MM-DD.",
                        "code": "fecha_invalida",
                        "errors": {"fecha": ["Formato inválido."]},
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        filas = get_resumen_tasas(fecha)
        return Response(
            {
                "fecha": (fecha or timezone.localdate()).isoformat(),
                "monedas": ResumenTasaSerializer(filas, many=True).data,
            }
        )
