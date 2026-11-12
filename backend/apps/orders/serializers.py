"""Serializers de pedidos."""

from decimal import Decimal

from rest_framework import serializers

from apps.common.utils.money import money, to_decimal
from apps.company.services import get_empresa, get_tasa_del_dia
from apps.inventory.models import Combo, Producto

from .models import Pedido, PedidoDetalle
from .services import (
    actualizar_pedido,
    anular_pedido,
    confirmar_pedido,
    crear_pedido,
    entregar_pedido,
)


class PedidoDetalleInputSerializer(serializers.Serializer):
    producto = serializers.PrimaryKeyRelatedField(
        queryset=Producto.objects.all(),
        required=False,
        allow_null=True,
    )
    combo = serializers.PrimaryKeyRelatedField(
        queryset=Combo.objects.all(),
        required=False,
        allow_null=True,
    )
    descripcion = serializers.CharField(required=False, allow_blank=True, max_length=200)
    cantidad = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.001"),
    )
    precio_unitario = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=Decimal("0"),
    )
    descuento_linea = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        required=False,
        default=Decimal("0.00"),
        min_value=Decimal("0"),
    )

    def validate(self, attrs):
        producto = attrs.get("producto")
        combo = attrs.get("combo")
        if producto is not None and combo is not None:
            raise serializers.ValidationError(
                "No se puede indicar producto y combo en la misma línea."
            )
        if producto is None and combo is None:
            raise serializers.ValidationError("Debe indicar un producto o un combo en la línea.")
        return attrs


class PedidoDetalleSerializer(serializers.ModelSerializer):
    producto_sku = serializers.CharField(source="producto.sku", read_only=True, default=None)
    producto_nombre = serializers.CharField(source="producto.nombre", read_only=True, default=None)
    combo_sku = serializers.CharField(source="combo.sku", read_only=True, default=None)
    combo_nombre = serializers.CharField(source="combo.nombre", read_only=True, default=None)

    class Meta:
        model = PedidoDetalle
        fields = (
            "id",
            "producto",
            "combo",
            "producto_sku",
            "producto_nombre",
            "combo_sku",
            "combo_nombre",
            "descripcion",
            "cantidad",
            "precio_unitario",
            "costo_unitario",
            "descuento_linea",
            "iva_linea",
            "subtotal",
            "combo_snapshot",
        )
        read_only_fields = (
            "id",
            "costo_unitario",
            "iva_linea",
            "subtotal",
            "combo_snapshot",
        )


class PedidoSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source="cliente.nombre", read_only=True)
    cliente_codigo = serializers.CharField(source="cliente.codigo", read_only=True)
    estado_display = serializers.CharField(source="get_estado_display", read_only=True)
    tipo_pago_display = serializers.CharField(source="get_tipo_pago_display", read_only=True)
    detalles = PedidoDetalleInputSerializer(many=True, write_only=True)
    lineas = PedidoDetalleSerializer(source="detalles", many=True, read_only=True)
    creado_por = serializers.CharField(source="created_by.nombre", read_only=True, default=None)
    anulado_por_nombre = serializers.CharField(
        source="anulado_por.nombre", read_only=True, default=None
    )
    puede_editar = serializers.BooleanField(read_only=True)
    puede_confirmar = serializers.BooleanField(read_only=True)
    puede_anular = serializers.BooleanField(read_only=True)
    tasa_bcv = serializers.SerializerMethodField()
    tasa_bcv_vigente_desde = serializers.SerializerMethodField()
    total_ves = serializers.SerializerMethodField()
    total_usd = serializers.SerializerMethodField()

    moneda = serializers.CharField(required=False, allow_blank=True, max_length=3)
    tasa_cambio = serializers.DecimalField(
        max_digits=18,
        decimal_places=6,
        required=False,
        allow_null=True,
        min_value=Decimal("0.000001"),
    )
    fecha = serializers.DateField(required=False)
    descuento = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        required=False,
        default=Decimal("0.00"),
        min_value=Decimal("0"),
    )
    tipo_pago = serializers.ChoiceField(
        choices=Pedido.TipoPago.choices, required=False, default=Pedido.TipoPago.CONTADO
    )

    class Meta:
        model = Pedido
        fields = (
            "id",
            "numero",
            "cliente",
            "cliente_nombre",
            "cliente_codigo",
            "fecha",
            "moneda",
            "tasa_cambio",
            "tasa_bcv",
            "tasa_bcv_vigente_desde",
            "total_ves",
            "total_usd",
            "tipo_pago",
            "tipo_pago_display",
            "subtotal",
            "descuento",
            "iva",
            "total",
            "total_base",
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
            "puede_confirmar",
            "puede_anular",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "numero",
            "subtotal",
            "descuento",
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

    @property
    def _moneda_base(self) -> str:
        if not hasattr(self, "_moneda_base_cache"):
            empresa = get_empresa()
            self._moneda_base_cache = ((empresa.moneda_base if empresa else "") or "USD").upper()
        return self._moneda_base_cache

    def _tasa_obj(self, moneda: str, base: str, fecha):
        """Tasa (objeto) del par para la fecha del documento, cacheada por request."""
        cache = self.context.setdefault("_tasas_pedido", {})
        clave = (moneda.upper(), base.upper(), fecha)
        if clave not in cache:
            cache[clave] = get_tasa_del_dia(moneda, fecha, base=base)
        return cache[clave]

    def _tasa(self, moneda: str, base: str, fecha):
        obj = self._tasa_obj(moneda, base, fecha)
        return obj.tasa if obj else None

    def _total_base_exacto(self, obj: Pedido) -> Decimal | None:
        """Total en moneda base sin redondear, para no arrastrar desvíos."""
        if obj.moneda.upper() == self._moneda_base:
            return to_decimal(obj.total)
        tasa = to_decimal(obj.tasa_cambio)
        if tasa <= 0:
            return None
        return to_decimal(obj.total) / tasa

    def get_tasa_bcv(self, obj: Pedido) -> str | None:
        """Tasa del dólar BCV (Bs por 1 USD) vigente en la fecha del documento."""
        if obj.tasa_bcv is not None:
            return f"{obj.tasa_bcv:.6f}"
        tasa = self._tasa("VES", "USD", obj.fecha)
        return f"{tasa:.6f}" if tasa is not None else None

    def get_tasa_bcv_vigente_desde(self, obj: Pedido) -> str | None:
        """Fecha y hora en que quedó vigente la tasa BCV usada en el documento."""
        if obj.tasa_bcv_vigente_desde is not None:
            return obj.tasa_bcv_vigente_desde.isoformat()
        tasa_obj = self._tasa_obj("VES", "USD", obj.fecha)
        if tasa_obj is None or tasa_obj.vigente_desde is None:
            return None
        return tasa_obj.vigente_desde.isoformat()

    def get_total_usd(self, obj: Pedido) -> str | None:
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

    def get_total_ves(self, obj: Pedido) -> str | None:
        """Equivalente del total en bolívares.

        Si el documento ya está en bolívares se usa su total; si no, se convierte
        el equivalente en dólares con la tasa BCV congelada (o histórico).
        """
        if obj.moneda.upper() == "VES":
            return str(money(obj.total))

        total_usd = self.get_total_usd(obj)
        tasa_bcv = obj.tasa_bcv if obj.tasa_bcv is not None else self._tasa("VES", "USD", obj.fecha)
        if total_usd is None or tasa_bcv is None:
            return None

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

    def validate_detalles(self, value):
        if not value:
            raise serializers.ValidationError("Agrega al menos una línea de pedido.")
        return value

    def validate_moneda(self, value: str) -> str:
        return (value or "").strip().upper()

    def create(self, validated_data):
        detalles = validated_data.pop("detalles")
        return crear_pedido(
            validated_data,
            detalles,
            user=self.context["request"].user,
        )

    def update(self, instance, validated_data):
        detalles = validated_data.pop("detalles", None)
        if detalles is None:
            detalles = [
                {
                    "producto": d.producto,
                    "combo": d.combo,
                    "cantidad": d.cantidad,
                    "precio_unitario": d.precio_unitario,
                    "descuento_linea": d.descuento_linea,
                    "descripcion": d.descripcion,
                }
                for d in instance.detalles.select_related("producto", "combo")
            ]
        return actualizar_pedido(
            instance,
            validated_data,
            detalles,
            user=self.context["request"].user,
        )


class ConfirmarPedidoSerializer(serializers.Serializer):
    """Serializer vacío: la acción de confirmación no recibe datos adicionales."""

    def save(self, **kwargs):
        pedido = self.context["pedido"]
        return confirmar_pedido(pedido, user=self.context["request"].user)


class AnularPedidoSerializer(serializers.Serializer):
    motivo = serializers.CharField(max_length=500)

    def validate_motivo(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Indica el motivo de la anulación.")
        return value

    def save(self, **kwargs):
        pedido = self.context["pedido"]
        return anular_pedido(
            pedido,
            self.validated_data["motivo"],
            user=self.context["request"].user,
        )


class EntregarPedidoSerializer(serializers.Serializer):
    """Serializer vacío: la acción de entrega no recibe datos adicionales."""

    def save(self, **kwargs):
        pedido = self.context["pedido"]
        return entregar_pedido(pedido, user=self.context["request"].user)
