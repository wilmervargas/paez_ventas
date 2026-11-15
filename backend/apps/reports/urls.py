"""Rutas de reportes."""

from django.urls import path

from .views import ReporteExportView, ReporteView

urlpatterns = [
    path("reportes/<slug:tipo>/", ReporteView.as_view(), name="reporte"),
    path(
        "reportes/<slug:tipo>/exportar/<slug:formato>/",
        ReporteExportView.as_view(),
        name="reporte-export",
    ),
]
