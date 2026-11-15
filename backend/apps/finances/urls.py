"""Rutas de finanzas (deudas, pagos, caja)."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CajaActualView,
    CajaSesionViewSet,
    DeudaViewSet,
    PagoViewSet,
    WhatsAppEstadoView,
)

router = DefaultRouter()
router.register("deudas", DeudaViewSet, basename="deuda")
router.register("pagos", PagoViewSet, basename="pago")
router.register("caja/sesiones", CajaSesionViewSet, basename="caja-sesion")

urlpatterns = [
    path("caja/actual/", CajaActualView.as_view(), name="caja-actual"),
    path("whatsapp/estado/", WhatsAppEstadoView.as_view(), name="whatsapp-estado"),
    *router.urls,
]
