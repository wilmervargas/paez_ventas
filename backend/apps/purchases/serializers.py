"""Serializers de compras."""

from decimal import Decimal

from rest_framework import serializers

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

    moneda = serializers.CharField(required=False, allow_blank=True, max_length=3)
    tasa_cambio = serializers.DecimalField(
        max_digits=18,
        decimal_places=6,
        required=False,
        allow_null=True,
        min_value=Decimal("0.000001"),
    )
    fecha = serializers.DateField(required=False)

    class Meta:
        model = Compra
        fields = (
            "id",
            "numero",
            "proveedor",
            "proveedor_nombre",
            "proveedor_codigo",
            "fecha",
            "moneda",
            "tasa_cambio",
            "subtotal",
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

    def validate_moneda(self, value: str) -> str:
        return (value or "").strip().upper()

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
