"""Catálogo, combos, kardex y stock."""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F

from apps.common.models import BaseModel


class CategoriaProducto(BaseModel):
    nombre = models.CharField("nombre", max_length=100, unique=True)
    activo = models.BooleanField("activa", default=True)

    class Meta:
        verbose_name = "categoría de producto"
        verbose_name_plural = "categorías de producto"
        ordering = ("nombre",)

    def __str__(self) -> str:
        return self.nombre


class UnidadMedida(BaseModel):
    nombre = models.CharField("nombre", max_length=100, unique=True)
    abreviatura = models.CharField("abreviatura", max_length=10, unique=True)

    class Meta:
        verbose_name = "unidad de medida"
        verbose_name_plural = "unidades de medida"
        ordering = ("nombre",)

    def __str__(self) -> str:
        return f"{self.nombre} ({self.abreviatura})"


class Producto(BaseModel):
    """Producto del catálogo.

    `stock` es un caché derivado del kardex: solo cambia a través de
    `MovimientoInventario`, nunca de forma directa.
    """

    sku = models.CharField("SKU", max_length=50, unique=True)
    nombre = models.CharField("nombre", max_length=200, db_index=True)
    categoria = models.ForeignKey(
        CategoriaProducto,
        verbose_name="categoría",
        on_delete=models.PROTECT,
        related_name="productos",
    )
    unidad = models.ForeignKey(
        UnidadMedida,
        verbose_name="unidad",
        on_delete=models.PROTECT,
        related_name="productos",
    )
    costo = models.DecimalField(
        "costo",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    precio = models.DecimalField(
        "precio",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    stock = models.DecimalField(
        "stock",
        max_digits=14,
        decimal_places=3,
        default=Decimal("0.000"),
        editable=False,
    )
    stock_minimo = models.DecimalField(
        "stock mínimo",
        max_digits=14,
        decimal_places=3,
        default=Decimal("0.000"),
    )
    iva_aplicable = models.BooleanField("aplica IVA", default=True)
    activo = models.BooleanField("activo", default=True, db_index=True)
    imagen = models.ImageField("imagen", upload_to="productos/", blank=True)

    class Meta:
        verbose_name = "producto"
        verbose_name_plural = "productos"
        ordering = ("nombre",)
        indexes = [
            models.Index(fields=("activo", "nombre"), name="producto_activo_nombre_idx"),
            models.Index(fields=("categoria", "activo"), name="producto_categoria_activo_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.sku} · {self.nombre}"

    def clean(self):
        errors = {}
        if self.costo is not None and self.costo < 0:
            errors["costo"] = "El costo no puede ser negativo."
        if self.precio is not None and self.precio < 0:
            errors["precio"] = "El precio no puede ser negativo."
        if self.stock_minimo is not None and self.stock_minimo < 0:
            errors["stock_minimo"] = "El stock mínimo no puede ser negativo."
        if errors:
            raise ValidationError(errors)

    @property
    def margen(self) -> Decimal:
        return self.precio - self.costo

    @property
    def stock_bajo(self) -> bool:
        return self.stock <= self.stock_minimo

    @classmethod
    def con_stock_bajo(cls):
        return cls.objects.filter(activo=True, stock__lte=F("stock_minimo"))


class Combo(BaseModel):
    """Combo virtual: no tiene stock propio, descuenta el de sus componentes."""

    sku = models.CharField("SKU", max_length=50, unique=True)
    nombre = models.CharField("nombre", max_length=200, db_index=True)
    precio = models.DecimalField(
        "precio",
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    activo = models.BooleanField("activo", default=True, db_index=True)

    class Meta:
        verbose_name = "combo"
        verbose_name_plural = "combos"
        ordering = ("nombre",)

    def __str__(self) -> str:
        return f"{self.sku} · {self.nombre}"

    def clean(self):
        if self.precio is not None and self.precio < 0:
            raise ValidationError({"precio": "El precio no puede ser negativo."})


class ComboProducto(BaseModel):
    combo = models.ForeignKey(
        Combo,
        verbose_name="combo",
        on_delete=models.CASCADE,
        related_name="componentes",
    )
    producto = models.ForeignKey(
        Producto,
        verbose_name="producto",
        on_delete=models.PROTECT,
        related_name="combos",
    )
    cantidad = models.DecimalField("cantidad", max_digits=14, decimal_places=3)

    class Meta:
        verbose_name = "componente de combo"
        verbose_name_plural = "componentes de combo"
        ordering = ("producto__nombre",)
        constraints = [
            models.UniqueConstraint(
                fields=("combo", "producto"),
                name="unique_producto_por_combo",
            ),
            models.CheckConstraint(
                condition=models.Q(cantidad__gt=0),
                name="combo_cantidad_positiva",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.combo.sku} · {self.producto.sku} x {self.cantidad}"

    def clean(self):
        if self.cantidad is not None and self.cantidad <= 0:
            raise ValidationError({"cantidad": "La cantidad debe ser mayor que cero."})


class MovimientoInventario(BaseModel):
    """Kardex: única vía por la que cambia el stock de un producto."""

    class Tipo(models.TextChoices):
        ENTRADA = "entrada", "Entrada"
        SALIDA = "salida", "Salida"
        AJUSTE = "ajuste", "Ajuste"
        VENTA = "venta", "Venta"
        COMPRA = "compra", "Compra"
        DEVOLUCION = "devolucion", "Devolución"
        ANULACION = "anulacion", "Anulación"

    class Direccion(models.TextChoices):
        ENTRADA = "entrada", "Entrada"
        SALIDA = "salida", "Salida"

    producto = models.ForeignKey(
        Producto,
        verbose_name="producto",
        on_delete=models.PROTECT,
        related_name="movimientos",
    )
    tipo = models.CharField("tipo", max_length=20, choices=Tipo.choices, db_index=True)
    direccion = models.CharField(
        "dirección",
        max_length=10,
        choices=Direccion.choices,
        default=Direccion.ENTRADA,
    )
    cantidad = models.DecimalField("cantidad", max_digits=14, decimal_places=3)
    costo_unitario = models.DecimalField(
        "costo unitario",
        max_digits=14,
        decimal_places=4,
        default=Decimal("0.0000"),
    )
    motivo = models.CharField("motivo", max_length=200, blank=True)
    referencia_tipo = models.CharField("tipo de referencia", max_length=30, blank=True)
    referencia_id = models.PositiveBigIntegerField("id de referencia", null=True, blank=True)

    class Meta:
        verbose_name = "movimiento de inventario"
        verbose_name_plural = "movimientos de inventario"
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(
                fields=("producto", "-created_at"),
                name="mov_producto_fecha_idx",
            ),
            models.Index(fields=("tipo", "-created_at"), name="mov_tipo_fecha_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(cantidad__gt=0),
                name="movimiento_cantidad_positiva",
            )
        ]

    def __str__(self) -> str:
        signo = "+" if self.direccion == self.Direccion.ENTRADA else "-"
        return f"{self.producto.sku} {signo}{self.cantidad} ({self.get_tipo_display()})"

    @property
    def signo(self) -> int:
        return 1 if self.direccion == self.Direccion.ENTRADA else -1

    def clean(self):
        errors = {}
        if self.cantidad is not None and self.cantidad <= 0:
            errors["cantidad"] = "La cantidad debe ser mayor que cero."
        if self.costo_unitario is not None and self.costo_unitario < 0:
            errors["costo_unitario"] = "El costo unitario no puede ser negativo."

        direccion_esperada = {
            self.Tipo.COMPRA: self.Direccion.ENTRADA,
            self.Tipo.DEVOLUCION: self.Direccion.ENTRADA,
            self.Tipo.ENTRADA: self.Direccion.ENTRADA,
            self.Tipo.VENTA: self.Direccion.SALIDA,
            self.Tipo.SALIDA: self.Direccion.SALIDA,
        }.get(self.tipo)
        if direccion_esperada and self.direccion != direccion_esperada:
            errors["direccion"] = (
                f"El tipo {self.get_tipo_display().lower()} requiere dirección "
                f"{direccion_esperada}."
            )

        if errors:
            raise ValidationError(errors)
