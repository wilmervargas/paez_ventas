"""Cuentas por cobrar, pagos y caja."""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.clients.models import Cliente
from apps.common.models import BaseModel


class Deuda(BaseModel):
    """Cuenta por cobrar generada a partir de un pedido vendido a crédito."""

    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        PAGADA = "pagada", "Pagada"
        ANULADA = "anulada", "Anulada"

    cliente = models.ForeignKey(
        Cliente,
        verbose_name="cliente",
        on_delete=models.PROTECT,
        related_name="deudas",
    )
    pedido = models.OneToOneField(
        "orders.Pedido",
        verbose_name="pedido",
        on_delete=models.PROTECT,
        related_name="deuda",
    )
    moneda = models.CharField("moneda", max_length=3, default="USD")
    tasa_cambio = models.DecimalField(
        "tasa de cambio",
        max_digits=18,
        decimal_places=6,
        default=Decimal("1.000000"),
    )
    monto_original = models.DecimalField("monto original", max_digits=14, decimal_places=2)
    saldo = models.DecimalField("saldo", max_digits=14, decimal_places=2, default=Decimal("0.00"))
    tasa_bcv = models.DecimalField(
        "tasa BCV del documento",
        max_digits=18,
        decimal_places=6,
        null=True,
        blank=True,
    )
    tasa_bcv_vigente_desde = models.DateTimeField(
        "vigencia de la tasa BCV",
        null=True,
        blank=True,
    )
    fecha_emision = models.DateField("fecha de emisión", default=timezone.localdate, db_index=True)
    fecha_vencimiento = models.DateField(
        "fecha de vencimiento", null=True, blank=True, db_index=True
    )
    estado = models.CharField(
        "estado",
        max_length=10,
        choices=Estado.choices,
        default=Estado.PENDIENTE,
        db_index=True,
    )
    anulado_por = models.ForeignKey(
        "accounts.User",
        verbose_name="anulado por",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deudas_anuladas",
    )
    motivo_anulacion = models.TextField("motivo de anulación", blank=True)
    fecha_anulacion = models.DateTimeField("fecha de anulación", null=True, blank=True)

    class Meta:
        verbose_name = "deuda"
        verbose_name_plural = "deudas"
        ordering = ("-fecha_emision", "-id")
        indexes = [
            models.Index(fields=("estado", "-fecha_emision"), name="deuda_estado_fecha_idx"),
            models.Index(fields=("cliente", "-fecha_emision"), name="deuda_cliente_fecha_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.pedido.numero} · {self.cliente.nombre} · {self.saldo}"

    @property
    def vencida(self) -> bool:
        from django.utils import timezone

        if self.estado != self.Estado.PENDIENTE or self.saldo <= 0:
            return False
        if not self.fecha_vencimiento:
            return False
        return timezone.localdate() > self.fecha_vencimiento

    def clean(self):
        errors = {}
        if self.tasa_cambio is not None and self.tasa_cambio <= 0:
            errors["tasa_cambio"] = "La tasa de cambio debe ser mayor que cero."
        for campo in ("monto_original", "saldo"):
            valor = getattr(self, campo)
            if valor is not None and valor < 0:
                errors[campo] = "El monto no puede ser negativo."
        if errors:
            raise ValidationError(errors)
