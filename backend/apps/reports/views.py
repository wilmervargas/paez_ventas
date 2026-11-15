"""Vistas de reportes y exportaciones."""

from django.http import Http404, HttpResponse
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import IsAuthenticatedAndCompanyReady

from .exports import render_pdf, render_xlsx
from .serializers import ReporteFiltrosSerializer
from .services import construir_reporte, get_reporte_def

FORMATOS = {
    "pdf": ("application/pdf", render_pdf),
    "xlsx": (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        render_xlsx,
    ),
}


class ReporteMixin:
    permission_classes = (IsAuthenticatedAndCompanyReady,)

    def preparar(self, request, tipo: str) -> dict:
        definition = get_reporte_def(tipo)
        if definition is None:
            raise Http404("Reporte no encontrado.")
        if request.user.rol not in definition.roles:
            raise PermissionDenied("No tienes permisos para ver este reporte.")

        serializer = ReporteFiltrosSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        filtros = {key: value for key, value in serializer.validated_data.items() if value != ""}
        return construir_reporte(tipo, filtros, request.user)


class ReporteView(ReporteMixin, APIView):
    """Devuelve el reporte en JSON con filtros opcionales."""

    def get(self, request, tipo: str):
        payload = self.preparar(request, tipo)
        return Response(payload)


class ReporteExportView(ReporteMixin, APIView):
    """Descarga el reporte en PDF o Excel conservando los filtros aplicados."""

    def get(self, request, tipo: str, formato: str):
        if formato not in FORMATOS:
            raise Http404("Formato no soportado.")

        payload = self.preparar(request, tipo)
        content_type, render = FORMATOS[formato]
        contenido = render(payload)
        sello = timezone.localtime().strftime("%Y%m%d-%H%M")
        filename = f"reporte-{tipo}-{sello}.{formato}"

        response = HttpResponse(contenido, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["Cache-Control"] = "no-store"
        return response
