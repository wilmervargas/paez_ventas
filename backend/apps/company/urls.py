"""Rutas de empresa y tasas."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import EmpresaView, LimpiarBaseDatosView, RespaldoBaseDatosView, TasaCambioViewSet

router = DefaultRouter()
router.register("tasas-cambio", TasaCambioViewSet, basename="tasa-cambio")

urlpatterns = [
    path("company/", EmpresaView.as_view(), name="empresa"),
    path("company/limpiar-base-datos/", LimpiarBaseDatosView.as_view(), name="limpiar-base-datos"),
    path("company/respaldo/", RespaldoBaseDatosView.as_view(), name="respaldo-base-datos"),
    *router.urls,
]
