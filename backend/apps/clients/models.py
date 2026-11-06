"""Clientes y proveedores."""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models

from apps.common.models import BaseModel


class Cliente(BaseModel):
    """Cliente de la empresa. Se desactiva, nunca se elimina."""

    codigo = models.CharField("código", max_length=20, unique=True)
    nombre = models.CharField("nombre", max_length=200, db_index=True)
    rif_cedula = models.CharField("RIF / cédula", max_length=20, blank=True, db_index=True)
    telefono = models.CharField("teléfono", max_length=20, blank=True)
    telefono_alt = models.CharField("teléfono alterno", max_length=20, blank=True)
    email = models.EmailField("correo", blank=True)
    direccion = models.TextField("dirección", blank=True)
    limite_credito = models.DecimalField(
        "límite de crédito",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    notas = models.TextField("notas", blank=True)
    activo = models.BooleanField("activo", default=True, db_index=True)

    class Meta:
        verbose_name = "cliente"
        verbose_name_plural = "clientes"
        ordering = ("nombre",)
        indexes = [models.Index(fields=("activo", "nombre"), name="cliente_activo_nombre_idx")]

    def __str__(self) -> str:
        return f"{self.codigo} · {self.nombre}"

    def clean(self):
        if self.limite_credito is not None and self.limite_credito < 0:
            raise ValidationError({"limite_credito": "El límite de crédito no puede ser negativo."})


class Proveedor(BaseModel):
    """Proveedor de productos y servicios."""

    codigo = models.CharField("código", max_length=20, unique=True)
    nombre = models.CharField("nombre", max_length=200, db_index=True)
    rif = models.CharField("RIF", max_length=20, blank=True, db_index=True)
    telefono = models.CharField("teléfono", max_length=20, blank=True)
    email = models.EmailField("correo", blank=True)
    direccion = models.TextField("dirección", blank=True)
    activo = models.BooleanField("activo", default=True, db_index=True)

    class Meta:
        verbose_name = "proveedor"
        verbose_name_plural = "proveedores"
        ordering = ("nombre",)
        indexes = [models.Index(fields=("activo", "nombre"), name="proveedor_activo_nombre_idx")]

    def __str__(self) -> str:
        return f"{self.codigo} · {self.nombre}"
