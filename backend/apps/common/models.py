"""Modelos base compartidos por todo el proyecto."""

from django.conf import settings
from django.db import models


class BaseModel(models.Model):
    """Campos de auditoría comunes.

    Todas las entidades de negocio deben heredar de este modelo.
    """

    created_at = models.DateTimeField("creado el", auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField("actualizado el", auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="creado por",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="%(app_label)s_%(class)s_created",
    )

    class Meta:
        abstract = True


class Secuencia(BaseModel):
    """Contador interno por documento y año.

    La numeración es de control interno, no fiscal. El incremento se hace
    dentro de la transacción que crea el documento para evitar duplicados.
    """

    nombre = models.CharField("nombre", max_length=30)
    anio = models.PositiveIntegerField("año")
    ultimo_valor = models.PositiveBigIntegerField("último valor", default=0)

    class Meta:
        verbose_name = "secuencia"
        verbose_name_plural = "secuencias"
        ordering = ("nombre", "anio")
        constraints = [
            models.UniqueConstraint(
                fields=("nombre", "anio"),
                name="unique_secuencia_por_nombre_y_anio",
            )
        ]

    def __str__(self) -> str:
        return f"{self.nombre}-{self.anio}: {self.ultimo_valor}"
