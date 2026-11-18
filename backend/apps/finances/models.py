"""Cuentas por cobrar, pagos, cuotas y caja."""

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
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
    moneda = models.CharField("moneda", max_length=10, default="USD")
    tasa_cambio = models.DecimalField(
        "tasa de cambio",
        max_digits=18,
        decimal_places=6,
        default=Decimal("1.000000"),
    )
    monto_original = models.DecimalField("monto original", max_digits=14, decimal_places=2)
    saldo = models.DecimalField("saldo", max_digits=14, decimal_places=2, default=Decimal("0.00"))
    saldo_bs = models.DecimalField(
        "saldo en bolívares",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Saldo pendiente expresado en bolívares.",
    )
    saldo_base = models.DecimalField(
        "saldo en divisa de la tasa",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Saldo pendiente en la divisa usada en la tasa (USD, EUR o USDT).",
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
        settings.AUTH_USER_MODEL,
        verbose_name="anulado por",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deudas_anuladas",
    )
    motivo_anulacion = models.TextField("motivo de anulación", blank=True)
    fecha_anulacion = models.DateTimeField("fecha de anulación", null=True, blank=True)

    saldo_ves_actual = models.DecimalField(
        "saldo en VES (actualizado)",
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Suma de equivalentes VES actualizados de cuotas pendientes/parciales.",
    )
    fecha_recalculo_tasa = models.DateTimeField(
        "fecha de recálculo de tasa",
        null=True,
        blank=True,
    )

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
        if self.estado != self.Estado.PENDIENTE or self.saldo <= 0:
            return False
        if not self.fecha_vencimiento:
            return False
        return timezone.localdate() > self.fecha_vencimiento

    def clean(self):
        errors = {}
        if self.tasa_cambio is not None and self.tasa_cambio <= 0:
            errors["tasa_cambio"] = "La tasa de cambio debe ser mayor que cero."
        for campo in ("monto_original", "saldo", "saldo_bs", "saldo_base"):
            valor = getattr(self, campo)
            if valor is not None and valor < 0:
                errors[campo] = "El monto no puede ser negativo."
        if errors:
            raise ValidationError(errors)


class Cuota(BaseModel):
    """Cuota de un plan de pago asociado a una deuda."""

    class Estado(models.TextChoices):
        PENDIENTE = "pendiente", "Pendiente"
        PARCIAL = "parcial", "Parcial"
        PAGADA = "pagada", "Pagada"

    deuda = models.ForeignKey(
        Deuda,
        verbose_name="deuda",
        on_delete=models.PROTECT,
        related_name="cuotas",
    )
    numero = models.PositiveSmallIntegerField(
        "número de cuota",
        validators=[MinValueValidator(1), MaxValueValidator(10)],
    )
    monto = models.DecimalField("monto", max_digits=14, decimal_places=2)
    saldo = models.DecimalField("saldo", max_digits=14, decimal_places=2)
    fecha_vencimiento = models.DateField("fecha de vencimiento", db_index=True)
    estado = models.CharField(
        "estado",
        max_length=10,
        choices=Estado.choices,
        default=Estado.PENDIENTE,
        db_index=True,
    )

    # Equivalente recalculado con tasa vigente (solo cobranza, no histórico)
    monto_ves_actual = models.DecimalField(
        "monto en VES (actualizado)",
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Equivalente en bolívares recalculado con la tasa vigente del día (solo cobranza).",
    )
    tasa_recalculo = models.DecimalField(
        "tasa usada en recálculo",
        max_digits=18,
        decimal_places=6,
        null=True,
        blank=True,
    )
    tasa_tipo_recalculo = models.CharField(
        "tipo de tasa del recálculo",
        max_length=20,
        null=True,
        blank=True,
    )
    fecha_recalculo_tasa = models.DateTimeField(
        "fecha de recálculo de tasa",
        null=True,
        blank=True,
    )

    class Meta:
        verbose_name = "cuota"
        verbose_name_plural = "cuotas"
        ordering = ("deuda", "numero")
        constraints = [
            models.UniqueConstraint(fields=("deuda", "numero"), name="cuota_deuda_numero_uniq"),
            models.CheckConstraint(
                condition=Q(numero__gte=1, numero__lte=10), name="cuota_numero_1_8"
            ),
            models.CheckConstraint(condition=Q(monto__gte=0), name="cuota_monto_no_negativo"),
            models.CheckConstraint(condition=Q(saldo__gte=0), name="cuota_saldo_no_negativo"),
        ]
        indexes = [
            models.Index(fields=("estado", "fecha_vencimiento"), name="cuota_estado_venc_idx")
        ]

    def __str__(self) -> str:
        return f"{self.deuda_id} cuota {self.numero} ({self.saldo}/{self.monto})"

    @property
    def vencida(self) -> bool:
        return (
            self.estado != self.Estado.PAGADA
            and self.saldo > 0
            and timezone.localdate() > self.fecha_vencimiento
        )

    def actualizar_estado(self):
        if self.saldo <= Decimal("0.00"):
            self.estado = self.Estado.PAGADA
            self.saldo = Decimal("0.00")
        elif self.saldo < self.monto:
            self.estado = self.Estado.PARCIAL
        else:
            self.estado = self.Estado.PENDIENTE


class CajaSesion(BaseModel):
    """Sesión/turno de caja."""

    class Estado(models.TextChoices):
        ABIERTA = "abierta", "Abierta"
        CERRADA = "cerrada", "Cerrada"

    usuario_apertura = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="usuario de apertura",
        on_delete=models.PROTECT,
        related_name="cajas_abiertas",
    )
    fecha_apertura = models.DateTimeField("fecha de apertura", default=timezone.now)
    monto_inicial = models.DecimalField(
        "monto inicial", max_digits=14, decimal_places=2, default=Decimal("0.00")
    )
    moneda = models.CharField("moneda", max_length=10, default="USD")
    usuario_cierre = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="usuario de cierre",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="cajas_cerradas",
    )
    fecha_cierre = models.DateTimeField("fecha de cierre", null=True, blank=True)
    monto_final_declarado = models.DecimalField(
        "monto final declarado", max_digits=14, decimal_places=2, null=True, blank=True
    )
    monto_sistema = models.DecimalField(
        "monto según sistema", max_digits=14, decimal_places=2, null=True, blank=True
    )
    diferencia = models.DecimalField(
        "diferencia", max_digits=14, decimal_places=2, null=True, blank=True
    )
    observaciones = models.TextField("observaciones", blank=True)
    estado = models.CharField(
        "estado", max_length=10, choices=Estado.choices, default=Estado.ABIERTA, db_index=True
    )

    class Meta:
        verbose_name = "sesión de caja"
        verbose_name_plural = "sesiones de caja"
        ordering = ("-fecha_apertura", "-id")

    def __str__(self) -> str:
        return f"Caja #{self.pk} {self.estado} ({self.usuario_apertura})"


class Pago(BaseModel):
    """Pago recibido de un cliente. Inmutable: se corrige anulando y creando uno nuevo."""

    class Metodo(models.TextChoices):
        EFECTIVO = "efectivo", "Efectivo"
        TRANSFERENCIA = "transferencia", "Transferencia"
        PAGO_MOVIL = "pago_movil", "Pago móvil"
        ZELLE = "zelle", "Zelle"
        OTRO = "otro", "Otro"

    numero = models.CharField("número", max_length=30, unique=True)
    cliente = models.ForeignKey(
        Cliente,
        verbose_name="cliente",
        on_delete=models.PROTECT,
        related_name="pagos",
    )
    fecha_pago = models.DateField("fecha de pago", default=timezone.localdate, db_index=True)
    moneda = models.CharField("moneda", max_length=10, default="USD")
    tasa_cambio = models.DecimalField(
        "tasa de cambio",
        max_digits=18,
        decimal_places=6,
        default=Decimal("1.000000"),
    )
    monto = models.DecimalField("monto", max_digits=14, decimal_places=2)
    monto_base = models.DecimalField("monto en moneda base", max_digits=14, decimal_places=2)
    metodo = models.CharField("método", max_length=15, choices=Metodo.choices)
    referencia = models.CharField("referencia / nº operación", max_length=100, blank=True)
    banco = models.CharField("banco", max_length=100, blank=True)
    telefono_origen = models.CharField("teléfono de origen", max_length=20, blank=True)
    monto_recibido_bs = models.DecimalField(
        "monto recibido en Bs",
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
    )
    tasa_usada_bs = models.DecimalField(
        "tasa usada (Bs)",
        max_digits=18,
        decimal_places=6,
        null=True,
        blank=True,
    )
    nota = models.TextField("nota", blank=True)
    caja_sesion = models.ForeignKey(
        CajaSesion,
        verbose_name="sesión de caja",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="pagos",
    )
    anulado = models.BooleanField("anulado", default=False, db_index=True)
    anulado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="anulado por",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="pagos_anulados",
    )
    motivo_anulacion = models.TextField("motivo de anulación", blank=True)
    fecha_anulacion = models.DateTimeField("fecha de anulación", null=True, blank=True)

    class Meta:
        verbose_name = "pago"
        verbose_name_plural = "pagos"
        ordering = ("-fecha_pago", "-id")
        indexes = [
            models.Index(fields=("cliente", "-fecha_pago"), name="pago_cliente_fecha_idx"),
            models.Index(fields=("anulado", "-fecha_pago"), name="pago_anulado_fecha_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.numero} · {self.cliente.nombre} · {self.monto}"


class PagoAplicacion(BaseModel):
    """Aplicación de un pago a una cuota/deuda específica."""

    pago = models.ForeignKey(
        Pago, verbose_name="pago", on_delete=models.PROTECT, related_name="aplicaciones"
    )
    deuda = models.ForeignKey(
        Deuda, verbose_name="deuda", on_delete=models.PROTECT, related_name="aplicaciones"
    )
    cuota = models.ForeignKey(
        Cuota,
        verbose_name="cuota",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="aplicaciones",
    )
    monto = models.DecimalField("monto aplicado", max_digits=14, decimal_places=2)

    class Meta:
        verbose_name = "aplicación de pago"
        verbose_name_plural = "aplicaciones de pago"
        ordering = ("id",)
        constraints = [
            models.CheckConstraint(condition=Q(monto__gt=0), name="pago_aplicacion_monto_positivo"),
        ]

    def __str__(self) -> str:
        return f"{self.pago_id} -> deuda {self.deuda_id} cuota {self.cuota_id}: {self.monto}"


class MovimientoCaja(BaseModel):
    """Movimiento de ingreso/egreso asociado a una sesión de caja."""

    class Tipo(models.TextChoices):
        INGRESO = "ingreso", "Ingreso"
        EGRESO = "egreso", "Egreso"

    caja_sesion = models.ForeignKey(
        CajaSesion,
        verbose_name="sesión de caja",
        on_delete=models.PROTECT,
        related_name="movimientos",
    )
    tipo = models.CharField("tipo", max_length=10, choices=Tipo.choices)
    concepto = models.CharField("concepto", max_length=255)
    monto = models.DecimalField("monto", max_digits=14, decimal_places=2)
    moneda = models.CharField("moneda", max_length=10, default="USD")
    tasa_cambio = models.DecimalField(
        "tasa de cambio", max_digits=18, decimal_places=6, default=Decimal("1.000000")
    )
    monto_base = models.DecimalField("monto en moneda base", max_digits=14, decimal_places=2)
    metodo = models.CharField("método", max_length=15, blank=True)
    referencia_tipo = models.CharField("tipo de referencia", max_length=30, blank=True)
    referencia_id = models.PositiveBigIntegerField("id de referencia", null=True, blank=True)
    es_efectivo = models.BooleanField("afecta efectivo", default=True)

    class Meta:
        verbose_name = "movimiento de caja"
        verbose_name_plural = "movimientos de caja"
        ordering = ("created_at", "id")
        indexes = [
            models.Index(fields=("caja_sesion", "created_at"), name="movcaja_sesion_fecha_idx"),
            models.Index(fields=("referencia_tipo", "referencia_id"), name="movcaja_ref_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.tipo} {self.monto} ({self.concepto})"
