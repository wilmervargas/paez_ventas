"""Administración del catálogo y el kardex."""

from django.contrib import admin

from .models import (
    CategoriaProducto,
    Combo,
    ComboProducto,
    MovimientoInventario,
    Producto,
    UnidadMedida,
)


@admin.register(CategoriaProducto)
class CategoriaProductoAdmin(admin.ModelAdmin):
    list_display = ("nombre", "activo")
    search_fields = ("nombre",)


@admin.register(UnidadMedida)
class UnidadMedidaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "abreviatura")
    search_fields = ("nombre", "abreviatura")


@admin.register(Producto)
class ProductoAdmin(admin.ModelAdmin):
    list_display = ("sku", "nombre", "categoria", "unidad", "precio", "stock", "activo")
    list_filter = ("activo", "categoria", "iva_aplicable")
    search_fields = ("sku", "nombre")
    readonly_fields = ("stock",)


class ComboProductoInline(admin.TabularInline):
    model = ComboProducto
    extra = 0


@admin.register(Combo)
class ComboAdmin(admin.ModelAdmin):
    list_display = ("sku", "nombre", "precio", "activo")
    list_filter = ("activo",)
    search_fields = ("sku", "nombre")
    inlines = (ComboProductoInline,)


@admin.register(MovimientoInventario)
class MovimientoInventarioAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "producto",
        "tipo",
        "direccion",
        "cantidad",
        "motivo",
        "created_by",
    )
    list_filter = ("tipo", "direccion")
    search_fields = ("producto__sku", "producto__nombre", "motivo")
    readonly_fields = (
        "producto",
        "tipo",
        "direccion",
        "cantidad",
        "costo_unitario",
        "motivo",
        "referencia_tipo",
        "referencia_id",
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
