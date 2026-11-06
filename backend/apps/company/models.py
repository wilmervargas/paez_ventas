"""Modelos de la empresa y tasas de cambio."""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.common.models import BaseModel


class Empresa(BaseModel):
    """Datos fiscales de la empresa. Singleton: siempre pk=1."""

    razon_social = models.CharField("razón social", max_length=200)
    nombre_comercial = models.CharField("nombre comercial", max_length=200, blank=True)
    rif = models.CharField("RIF", max_length=20, unique=True)
    representante = models.CharField("representante", max_length=150, blank=True)
    direccion = models.TextField("dirección", blank=True)
    telefono = models.CharField("teléfono", max_length=20, blank=True)
    email = models.EmailField("correo", blank=True)
    eslogan = models.CharField("eslogan", max_length=200, blank=True)
    logo = models.ImageField("logo", upload_to="empresa/", blank=True)
    moneda_base = models.CharField("moneda base", max_length=3, default="USD")
    iva_rate = models.DecimalField(
        "IVA (%)",
        max_digits=5,
        decimal_places=2,
        default=Decimal("16.00"),
    )
    igtf_rate = models.DecimalField(
        "IGTF (%)",
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    class Meta:
        verbose_name = "empresa"
        verbose_name_plural = "empresa"

    def __str__(self) -> str:
        return self.nombre_comercial or self.razon_social

    def save(self, *args, **kwargs):
        self.pk = 1
        # Protege filas creadas fuera de Django (por ejemplo, una carga manual
        # en SQLite): `created_at` NULL rompería el UPDATE por la restricción
        # NOT NULL y dejaría el CRUD de empresa inutilizable.
        if self.created_at is None:
            self.created_at = timezone.now()
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("La empresa no se elimina; solo se actualiza.")

    @classmethod
    def get_solo(cls):
        return cls.objects.filter(pk=1).first()


class TasaCambio(BaseModel):
    """Histórico de tasas: unidades de `moneda` por 1 unidad de moneda base."""

    class Fuente(models.TextChoices):
        BCV = "bcv", "BCV"
        MANUAL = "manual", "Manual"

    moneda = models.CharField("moneda", max_length=3, default="VES")
    tasa = models.DecimalField("tasa", max_digits=18, decimal_places=6)
    fuente = models.CharField(
        "fuente",
        max_length=10,
        choices=Fuente.choices,
        default=Fuente.MANUAL,
    )
    vigente_desde = models.DateTimeField("vigente desde", default=timezone.now, db_index=True)

    class Meta:
        verbose_name = "tasa de cambio"
        verbose_name_plural = "tasas de cambio"
        ordering = ("-vigente_desde",)
        constraints = [
            models.UniqueConstraint(
                fields=("moneda", "vigente_desde"),
                name="unique_tasa_por_moneda_y_fecha",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.moneda} {self.tasa} ({self.vigente_desde:%Y-%m-%d %H:%M})"

    def clean(self):
        if self.tasa is not None and self.tasa <= 0:
            raise ValidationError({"tasa": "La tasa debe ser mayor que cero."})
