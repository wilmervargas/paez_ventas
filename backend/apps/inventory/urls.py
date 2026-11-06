"""Rutas de catálogo e inventario."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AjusteInventarioView,
    CategoriaProductoViewSet,
    ComboViewSet,
    MovimientoInventarioViewSet,
    ProductoViewSet,
    UnidadMedidaViewSet,
)

router = DefaultRouter()
router.register("categorias-producto", CategoriaProductoViewSet, basename="categoria-producto")
router.register("unidades-medida", UnidadMedidaViewSet, basename="unidad-medida")
router.register("productos", ProductoViewSet, basename="producto")
router.register("combos", ComboViewSet, basename="combo")
router.register("inventario/movimientos", MovimientoInventarioViewSet, basename="movimiento")

urlpatterns = [
    path("inventario/ajustes/", AjusteInventarioView.as_view(), name="ajuste-inventario"),
    *router.urls,
]
