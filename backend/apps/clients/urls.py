"""Rutas de clientes y proveedores."""

from rest_framework.routers import DefaultRouter

from .views import ClienteViewSet, ProveedorViewSet

router = DefaultRouter()
router.register("clientes", ClienteViewSet, basename="cliente")
router.register("proveedores", ProveedorViewSet, basename="proveedor")

urlpatterns = router.urls
