"""Rutas de empresa y tasas."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import EmpresaView, TasaCambioViewSet

router = DefaultRouter()
router.register("tasas-cambio", TasaCambioViewSet, basename="tasa-cambio")

urlpatterns = [
    path("company/", EmpresaView.as_view(), name="empresa"),
    *router.urls,
]
