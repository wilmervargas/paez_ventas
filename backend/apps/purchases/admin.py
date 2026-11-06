"""Administración de compras."""

from django.contrib import admin

from .models import Compra, CompraDetalle


class CompraDetalleInline(admin.TabularInline):
    model = CompraDetalle
    extra = 0
    readonly_fields = ("subtotal",)
    can_delete = False


@admin.register(Compra)
class CompraAdmin(admin.ModelAdmin):
    list_display = (
        "numero",
        "proveedor",
        "fecha",
        "moneda",
        "total",
        "estado",
        "created_by",
    )
    list_filter = ("estado", "moneda", "fecha")
    search_fields = ("numero", "proveedor__nombre", "proveedor__rif")
    readonly_fields = (
        "numero",
        "subtotal",
        "iva",
        "total",
        "total_base",
        "estado",
        "anulado_por",
        "motivo_anulacion",
        "fecha_anulacion",
        "created_at",
        "updated_at",
    )
    inlines = (CompraDetalleInline,)

    def has_delete_permission(self, request, obj=None):
        return False
