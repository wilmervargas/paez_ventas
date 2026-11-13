"""Serializers de compras."""

from decimal import Decimal

from rest_framework import serializers

from apps.common.utils.money import money, to_decimal
from apps.company.services import get_empresa, get_tasa_del_dia
from apps.inventory.models import Producto

from .models import Compra, CompraDetalle
from .services import actualizar_compra, anular_compra, crear_compra, recibir_compra


class CompraDetalleInputSerializer(serializers.Serializer):
    producto = serializers.PrimaryKeyRelatedField(queryset=Producto.objects.all())
    cantidad = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.001"),
    )
    costo_unitario = serializers.DecimalField(
        max_digits=14,
        decimal_places=4,
        min_value=Decimal("0"),
    )
    aplica_iva = serializers.BooleanField(required=False, default=True)


class CompraDetalleSerializer(serializers.ModelSerializer):
    producto_sku = serializers.CharField(source="producto.sku", read_only=True)
    producto_nombre = serializers.CharField(source="producto.nombre", read_only=True)
    unidad_abreviatura = serializers.CharField(
        source="producto.unidad.abreviatura",
        read_only=True,
    )

    class Meta:
        model = CompraDetalle
        fields = (
            "id",
            "producto",
            "producto_sku",
            "producto_nombre",
            "unidad_abreviatura",
            "cantidad",
            "costo_unitario",
            "aplica_iva",
            "subtotal",
        )
        read_only_fields = fields


class CompraSerializer(serializers.ModelSerializer):
    proveedor_nombre = serializers.CharField(source="proveedor.nombre", read_only=True)
    proveedor_codigo = serializers.CharField(source="proveedor.codigo", read_only=True)
    estado_display = serializers.CharField(source="get_estado_display", read_only=True)
    detalles = CompraDetalleInputSerializer(many=True, write_only=True)
    lineas = CompraDetalleSerializer(source="detalles", many=True, read_only=True)
    creado_por = serializers.CharField(source="created_by.nombre", read_only=True, default=None)
    anulado_por_nombre = serializers.CharField(
        source="anulado_por.nombre",
        read_only=True,
        default=None,
    )
    puede_editar = serializers.BooleanField(read_only=True)
    puede_recibir = serializers.BooleanField(read_only=True)
    puede_anular = serializers.BooleanField(read_only=True)
    tasa_bcv = serializers.SerializerMethodField()
    tasa_bcv_vigente_desde = serializers.SerializerMethodField()
    total_ves = serializers.SerializerMethodField()
    total_usd = serializers.SerializerMethodField()
    adquirida_en = serializers.SerializerMethodField()

    moneda = serializers.CharField(required=False, allow_blank=True, max_length=3)
    tasa_cambio = serializers.DecimalField(
        max_digits=18,
        decimal_places=6,
        required=False,
        allow_null=True,
        min_value=Decimal("0.000001"),
    )
    otros_montos = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        required=False,
        min_value=Decimal("0.00"),
        default=Decimal("0.00"),
    )
    numero_referencia = serializers.CharField(
        required=False, allow_blank=True, max_length=50
    )
    fecha = serializers.DateField(required=False)

    class Meta:
        model = Compra
        fields = (
            "id",
            "numero",
            "numero_referencia",
            "proveedor",
            "proveedor_nombre",
            "proveedor_codigo",
            "fecha",
            "moneda",
            "tasa_cambio",
            "subtotal",
            "otros_montos",
            "iva",
            "total",
            "total_base",
            "tasa_bcv",
            "tasa_bcv_vigente_desde",
            "total_ves",
            "total_usd",
            "adquirida_en",
            "estado",
            "estado_display",
            "notas",
            "detalles",
            "lineas",
            "creado_por",
            "anulado_por",
            "anulado_por_nombre",
            "motivo_anulacion",
            "fecha_anulacion",
            "puede_editar",
            "puede_recibir",
            "puede_anular",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "numero",
            "subtotal",
            "iva",
            "total",
            "total_base",
            "estado",
            "anulado_por",
            "motivo_anulacion",
            "fecha_anulacion",
            "created_at",
            "updated_at",
        )

    def validate_detalles(self, value):
        if not value:
            raise serializers.ValidationError("Agrega al menos una línea de compra.")
        productos = [detalle["producto"].pk for detalle in value]
        if len(productos) != len(set(productos)):
            raise serializers.ValidationError("No repitas el mismo producto en la compra.")
        return value

    @property
    def _moneda_base(self) -> str:
        if not hasattr(self, "_moneda_base_cache"):
            empresa = get_empresa()
            self._moneda_base_cache = ((empresa.moneda_base if empresa else "") or "USD").upper()
        return self._moneda_base_cache

    def _tasa_obj(self, moneda: str, base: str, fecha):
        """Tasa (objeto) del par para la fecha del documento, cacheada por request."""
        cache = self.context.setdefault("_tasas_compra", {})
        clave = (moneda.upper(), base.upper(), fecha)
        if clave not in cache:
            cache[clave] = get_tasa_del_dia(moneda, fecha, base=base)
        return cache[clave]

    def _tasa(self, moneda: str, base: str, fecha):
        """Valor de la tasa del par para la fecha del documento."""
        obj = self._tasa_obj(moneda, base, fecha)
        return obj.tasa if obj else None

    def _total_base_exacto(self, obj: Compra) -> Decimal | None:
        """Total en moneda base sin redondear, para no arrastrar desvíos."""
        if obj.moneda.upper() == self._moneda_base:
            return to_decimal(obj.total)
        tasa = to_decimal(obj.tasa_cambio)
        if tasa <= 0:
            return None
        return to_decimal(obj.total) / tasa

    def get_tasa_bcv(self, obj: Compra) -> str | None:
        """Tasa del dólar BCV (Bs por 1 USD) vigente en la fecha del documento."""
        if obj.tasa_bcv is not None:
            return f"{obj.tasa_bcv:.6f}"
        tasa = self._tasa("VES", "USD", obj.fecha)
        return f"{tasa:.6f}" if tasa is not None else None

    def get_tasa_bcv_vigente_desde(self, obj: Compra) -> str | None:
        """Fecha y hora en que quedó vigente la tasa BCV usada en el documento."""
        if obj.tasa_bcv_vigente_desde is not None:
            return obj.tasa_bcv_vigente_desde.isoformat()
        tasa_obj = self._tasa_obj("VES", "USD", obj.fecha)
        if tasa_obj is None or tasa_obj.vigente_desde is None:
            return None
        return tasa_obj.vigente_desde.isoformat()

    def get_adquirida_en(self, obj: Compra) -> str | None:
        """Fecha y hora de recepción definitiva de la compra."""
        if obj.estado != Compra.Estado.RECIBIDA or obj.updated_at is None:
            return None
        return obj.updated_at.isoformat()

    def get_total_usd(self, obj: Compra) -> str | None:
        """Equivalente del total en dólares (moneda base congelada)."""
        base_exacto = self._total_base_exacto(obj)
        if base_exacto is None:
            return None
        if self._moneda_base == "USD":
            return str(money(base_exacto))
        tasa = self._tasa("USD", self._moneda_base, obj.fecha)
        if tasa is None:
            return None
        return str(money(base_exacto * tasa))

    def get_total_ves(self, obj: Compra) -> str | None:
        """Equivalente del total en bolívares.

        Si el documento ya está en bolívares se usa su total (no se reinterpreta
        con otra tasa); si no, se convierte el equivalente en dólares con la tasa
        BCV congelada en el documento (o la del histórico como respaldo).
        """
        if obj.moneda.upper() == "VES":
            return str(money(obj.total))

        total_usd = self.get_total_usd(obj)
        tasa_bcv = obj.tasa_bcv if obj.tasa_bcv is not None else self._tasa("VES", "USD", obj.fecha)
        if total_usd is None or tasa_bcv is None:
            return None

        # Se recalcula con la precisión completa del equivalente en dólares.
        base_exacto = self._total_base_exacto(obj)
        if base_exacto is None:
            return None
        if self._moneda_base == "USD":
            usd_exacto = base_exacto
        else:
            tasa_usd = self._tasa("USD", self._moneda_base, obj.fecha)
            if tasa_usd is None:
                return None
            usd_exacto = base_exacto * tasa_usd
        return str(money(usd_exacto * tasa_bcv))

    def validate_moneda(self, value: str) -> str:
        value = (value or "").strip().upper()
        if value and value not in {"VES", "USD", "EUR", "USDT"}:
            raise serializers.ValidationError("La moneda debe ser VES, USD, EUR o USDT.")
        return value

    def create(self, validated_data):
        detalles = validated_data.pop("detalles")
        return crear_compra(
            validated_data,
            detalles,
            user=self.context["request"].user,
        )

    def update(self, instance, validated_data):
        detalles = validated_data.pop("detalles", None)
        if detalles is None:
            detalles = [
                {
                    "producto": detalle.producto,
                    "cantidad": detalle.cantidad,
                    "costo_unitario": detalle.costo_unitario,
                    "aplica_iva": detalle.aplica_iva,
                }
                for detalle in instance.detalles.select_related("producto")
            ]
        return actualizar_compra(
            instance,
            validated_data,
            detalles,
            user=self.context["request"].user,
        )


class AnularCompraSerializer(serializers.Serializer):
    motivo = serializers.CharField(max_length=500)

    def validate_motivo(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Indica el motivo de la anulación.")
        return value

    def save(self, **kwargs):
        compra = self.context["compra"]
        return anular_compra(
            compra,
            self.validated_data["motivo"],
            user=self.context["request"].user,
        )


class RecibirCompraSerializer(serializers.Serializer):
    """Serializer vacío: la acción de recepción no recibe datos adicionales."""

    def save(self, **kwargs):
        compra = self.context["compra"]
        return recibir_compra(compra, user=self.context["request"].user)
