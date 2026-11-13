"""Pedidos de venta: productos sueltos, combos o ambos."""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.clients.models import Cliente
from apps.common.models import BaseModel
from apps.inventory.models import Combo, Producto


class Pedido(BaseModel):
    """Documento de venta. El stock se descuenta al confirmar."""

    class Estado(models.TextChoices):
        BORRADOR = "borrador", "Borrador"
        CONFIRMADO = "confirmado", "Confirmado"
        ENTREGADO = "entregado", "Entregado"
        ANULADO = "anulado", "Anulado"

    class TipoPago(models.TextChoices):
        CONTADO = "contado", "Contado"
        CREDITO = "credito", "Crédito"

    numero = models.CharField("número", max_length=30, unique=True)
    cliente = models.ForeignKey(
        Cliente,
        verbose_name="cliente",
        on_delete=models.PROTECT,
        related_name="pedidos",
    )
    fecha = models.DateField("fecha", default=timezone.localdate, db_index=True)
    estado = models.CharField(
        "estado",
        max_length=10,
        choices=Estado.choices,
        default=Estado.BORRADOR,
        db_index=True,
    )
    tipo_pago = models.CharField(
        "tipo de pago",
        max_length=10,
        choices=TipoPago.choices,
        default=TipoPago.CONTADO,
    )
    moneda = models.CharField("moneda", max_length=3, default="USD")
    tasa_cambio = models.DecimalField(
        "tasa de cambio",
        max_digits=18,
        decimal_places=6,
        default=Decimal("1.000000"),
    )
    subtotal = models.DecimalField(
        "subtotal", max_digits=14, decimal_places=2, default=Decimal("0.00")
    )
    descuento = models.DecimalField(
        "descuento", max_digits=14, decimal_places=2, default=Decimal("0.00")
    )
    iva = models.DecimalField("IVA", max_digits=14, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField("total", max_digits=14, decimal_places=2, default=Decimal("0.00"))
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
    otros_montos = models.DecimalField(
        "otros montos",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    numero_referencia = models.CharField(
        "número de pedido",
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
        related_name="pedidos_anulados",
    )
    motivo_anulacion = models.TextField("motivo de anulación", blank=True)
    fecha_anulacion = models.DateTimeField("fecha de anulación", null=True, blank=True)

    class Meta:
        verbose_name = "pedido"
        verbose_name_plural = "pedidos"
        ordering = ("-fecha", "-numero")
        indexes = [
            models.Index(fields=("estado", "-fecha"), name="pedido_estado_fecha_idx"),
            models.Index(fields=("cliente", "-fecha"), name="pedido_cliente_fecha_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.numero} · {self.cliente.nombre}"

    @property
    def puede_editar(self) -> bool:
        return self.estado == self.Estado.BORRADOR

    @property
    def puede_confirmar(self) -> bool:
        return self.estado == self.Estado.BORRADOR

    @property
    def puede_anular(self) -> bool:
        return self.estado != self.Estado.ANULADO

    def clean(self):
        errors = {}
        if self.tasa_cambio is not None and self.tasa_cambio <= 0:
            errors["tasa_cambio"] = "La tasa de cambio debe ser mayor que cero."
        for campo in ("subtotal", "descuento", "iva", "total", "total_base", "otros_montos"):
            valor = getattr(self, campo)
            if valor is not None and valor < 0:
                errors[campo] = "El monto no puede ser negativo."
        if errors:
            raise ValidationError(errors)


class PedidoDetalle(BaseModel):
    """Línea de pedido con precio y costo congelados al momento de la operación."""

    pedido = models.ForeignKey(
        Pedido,
        verbose_name="pedido",
        on_delete=models.PROTECT,
        related_name="detalles",
    )
    producto = models.ForeignKey(
        Producto,
        verbose_name="producto",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="pedidos_detalle",
    )
    combo = models.ForeignKey(
        Combo,
        verbose_name="combo",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="pedidos_detalle",
    )
    descripcion = models.CharField("descripción", max_length=200)
    cantidad = models.DecimalField("cantidad", max_digits=14, decimal_places=3)
    precio_unitario = models.DecimalField("precio unitario", max_digits=14, decimal_places=2)
    costo_unitario = models.DecimalField("costo unitario", max_digits=14, decimal_places=2)
    descuento_linea = models.DecimalField(
        "descuento línea", max_digits=14, decimal_places=2, default=Decimal("0.00")
    )
    aplica_iva = models.BooleanField("aplica IVA", default=True)
    iva_linea = models.DecimalField(
        "IVA línea", max_digits=14, decimal_places=2, default=Decimal("0.00")
    )
    subtotal = models.DecimalField(
        "subtotal", max_digits=14, decimal_places=2, default=Decimal("0.00")
    )
    combo_snapshot = models.JSONField("snapshot del combo", default=dict, blank=True)

    class Meta:
        verbose_name = "detalle de pedido"
        verbose_name_plural = "detalles de pedido"
        ordering = ("id",)
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(producto__isnull=False, combo__isnull=True)
                    | models.Q(producto__isnull=True, combo__isnull=False)
                ),
                name="pedido_detalle_producto_o_combo",
            ),
            models.CheckConstraint(
                condition=models.Q(cantidad__gt=0),
                name="pedido_detalle_cantidad_positiva",
            ),
            models.CheckConstraint(
                condition=models.Q(precio_unitario__gte=0),
                name="pedido_detalle_precio_no_negativo",
            ),
            models.CheckConstraint(
                condition=models.Q(subtotal__gte=0),
                name="pedido_detalle_subtotal_no_negativo",
            ),
        ]

    def __str__(self) -> str:
        clave = self.producto.sku if self.producto else self.combo.sku
        return f"{self.pedido.numero} · {clave} x {self.cantidad}"

    def clean(self):
        errors = {}
        if self.cantidad is not None and self.cantidad <= 0:
            errors["cantidad"] = "La cantidad debe ser mayor que cero."
        if self.precio_unitario is not None and self.precio_unitario < 0:
            errors["precio_unitario"] = "El precio unitario no puede ser negativo."
        if self.subtotal is not None and self.subtotal < 0:
            errors["subtotal"] = "El subtotal no puede ser negativo."
        if errors:
            raise ValidationError(errors)
