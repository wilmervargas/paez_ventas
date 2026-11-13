"""Compras a proveedores y recepción de mercancía."""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.clients.models import Proveedor
from apps.common.models import BaseModel
from apps.inventory.models import Producto


class Compra(BaseModel):
    """Documento de compra. Se recibe para afectar stock y costo."""

    class Estado(models.TextChoices):
        BORRADOR = "borrador", "Borrador"
        RECIBIDA = "recibida", "Recibida"
        ANULADA = "anulada", "Anulada"

    numero = models.CharField("número", max_length=30, unique=True)
    proveedor = models.ForeignKey(
        Proveedor,
        verbose_name="proveedor",
        on_delete=models.PROTECT,
        related_name="compras",
    )
    fecha = models.DateField("fecha", default=timezone.localdate, db_index=True)
    moneda = models.CharField("moneda", max_length=3, default="USD")
    tasa_cambio = models.DecimalField(
        "tasa de cambio",
        max_digits=18,
        decimal_places=6,
        default=Decimal("1.000000"),
    )
    subtotal = models.DecimalField(
        "subtotal",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    iva = models.DecimalField(
        "IVA",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    total = models.DecimalField(
        "total",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    total_base = models.DecimalField(
        "total en moneda base",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
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
    estado = models.CharField(
        "estado",
        max_length=10,
        choices=Estado.choices,
        default=Estado.BORRADOR,
        db_index=True,
    )
    otros_montos = models.DecimalField(
        "otros montos",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    numero_referencia = models.CharField(
        "número de orden/factura",
        max_length=50,
        blank=True,
    )
    notas = models.TextField("notas", blank=True)
    anulado_por = models.ForeignKey(
        "accounts.User",
        verbose_name="anulado por",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="compras_anuladas",
    )
    motivo_anulacion = models.TextField("motivo de anulación", blank=True)
    fecha_anulacion = models.DateTimeField("fecha de anulación", null=True, blank=True)

    class Meta:
        verbose_name = "compra"
        verbose_name_plural = "compras"
        ordering = ("-fecha", "-numero")
        indexes = [
            models.Index(fields=("estado", "-fecha"), name="compra_estado_fecha_idx"),
            models.Index(fields=("proveedor", "-fecha"), name="compra_proveedor_fecha_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.numero} · {self.proveedor.nombre}"

    @property
    def puede_editar(self) -> bool:
        return self.estado == self.Estado.BORRADOR

    @property
    def puede_recibir(self) -> bool:
        return self.estado == self.Estado.BORRADOR

    @property
    def puede_anular(self) -> bool:
        return self.estado != self.Estado.ANULADA

    def clean(self):
        errors = {}
        if self.tasa_cambio is not None and self.tasa_cambio <= 0:
            errors["tasa_cambio"] = "La tasa de cambio debe ser mayor que cero."
        for campo in ("subtotal", "iva", "total", "total_base", "otros_montos"):
            valor = getattr(self, campo)
            if valor is not None and valor < 0:
                errors[campo] = "El monto no puede ser negativo."
        if errors:
            raise ValidationError(errors)


class CompraDetalle(BaseModel):
    """Línea de compra con costo congelado al momento de la operación."""

    compra = models.ForeignKey(
        Compra,
        verbose_name="compra",
        on_delete=models.PROTECT,
        related_name="detalles",
    )
    producto = models.ForeignKey(
        Producto,
        verbose_name="producto",
        on_delete=models.PROTECT,
        related_name="compras_detalle",
    )
    cantidad = models.DecimalField("cantidad", max_digits=14, decimal_places=3)
    costo_unitario = models.DecimalField(
        "costo unitario",
        max_digits=14,
        decimal_places=4,
    )
    aplica_iva = models.BooleanField("aplica IVA", default=True)
    subtotal = models.DecimalField(
        "subtotal",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    class Meta:
        verbose_name = "detalle de compra"
        verbose_name_plural = "detalles de compra"
        ordering = ("id",)
        constraints = [
            models.UniqueConstraint(
                fields=("compra", "producto"),
                name="unique_producto_por_compra",
            ),
            models.CheckConstraint(
                condition=models.Q(cantidad__gt=0),
                name="compra_detalle_cantidad_positiva",
            ),
            models.CheckConstraint(
                condition=models.Q(costo_unitario__gte=0),
                name="compra_detalle_costo_no_negativo",
            ),
            models.CheckConstraint(
                condition=models.Q(subtotal__gte=0),
                name="compra_detalle_subtotal_no_negativo",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.compra.numero} · {self.producto.sku} x {self.cantidad}"

    def clean(self):
        errors = {}
        if self.cantidad is not None and self.cantidad <= 0:
            errors["cantidad"] = "La cantidad debe ser mayor que cero."
        if self.costo_unitario is not None and self.costo_unitario < 0:
            errors["costo_unitario"] = "El costo unitario no puede ser negativo."
        if self.subtotal is not None and self.subtotal < 0:
            errors["subtotal"] = "El subtotal no puede ser negativo."
        if errors:
            raise ValidationError(errors)
