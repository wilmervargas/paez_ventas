"""Administración de clientes y proveedores."""

from django.contrib import admin

from .models import Cliente, Proveedor


@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = ("codigo", "nombre", "rif_cedula", "telefono", "limite_credito", "activo")
    list_filter = ("activo",)
    search_fields = ("codigo", "nombre", "rif_cedula", "telefono")


@admin.register(Proveedor)
class ProveedorAdmin(admin.ModelAdmin):
    list_display = ("codigo", "nombre", "rif", "telefono", "activo")
    list_filter = ("activo",)
    search_fields = ("codigo", "nombre", "rif", "telefono")
