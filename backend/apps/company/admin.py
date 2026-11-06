"""Admin de empresa y tasas."""

from django.contrib import admin

from .models import Empresa, TasaCambio


@admin.register(Empresa)
class EmpresaAdmin(admin.ModelAdmin):
    list_display = ("razon_social", "rif", "moneda_base", "iva_rate")
    search_fields = ("razon_social", "rif")

    def has_add_permission(self, request):
        return not Empresa.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(TasaCambio)
class TasaCambioAdmin(admin.ModelAdmin):
    list_display = ("moneda", "tasa", "fuente", "vigente_desde")
    list_filter = ("moneda", "fuente")
    search_fields = ("moneda",)
    ordering = ("-vigente_desde",)
