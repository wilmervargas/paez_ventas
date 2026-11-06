"""Serializers de catálogo, combos e inventario."""

from decimal import Decimal

from rest_framework import serializers

from apps.common.utils.money import money

from .models import (
    CategoriaProducto,
    Combo,
    ComboProducto,
    MovimientoInventario,
    Producto,
    UnidadMedida,
)
from .services import (
    actualizar_combo,
    actualizar_producto,
    crear_combo,
    crear_producto,
    disponibilidad_combo,
    registrar_movimiento,
)

MAX_IMAGEN_BYTES = 2 * 1024 * 1024
TIPOS_IMAGEN = {"image/jpeg", "image/png", "image/webp"}


def _puede_ver_costos(request) -> bool:
    user = getattr(request, "user", None)
    return bool(user and user.is_authenticated and user.puede_ver_costos)


class CategoriaProductoSerializer(serializers.ModelSerializer):
    class Meta:
        model = CategoriaProducto
        fields = ("id", "nombre", "activo", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_nombre(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El nombre es obligatorio.")
        return value


class UnidadMedidaSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnidadMedida
        fields = ("id", "nombre", "abreviatura", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_nombre(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El nombre es obligatorio.")
        return value

    def validate_abreviatura(self, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise serializers.ValidationError("La abreviatura es obligatoria.")
        return value


class ProductoSerializer(serializers.ModelSerializer):
    stock_inicial = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        required=False,
        default=Decimal("0.000"),
        write_only=True,
        min_value=Decimal("0"),
    )
    categoria_nombre = serializers.CharField(source="categoria.nombre", read_only=True)
    unidad_nombre = serializers.CharField(source="unidad.nombre", read_only=True)
    unidad_abreviatura = serializers.CharField(source="unidad.abreviatura", read_only=True)
    margen = serializers.SerializerMethodField()
    stock_bajo = serializers.BooleanField(read_only=True)
    imagen_url = serializers.SerializerMethodField()

    class Meta:
        model = Producto
        fields = (
            "id",
            "sku",
            "nombre",
            "categoria",
            "categoria_nombre",
            "unidad",
            "unidad_nombre",
            "unidad_abreviatura",
            "costo",
            "precio",
            "margen",
            "stock",
            "stock_inicial",
            "stock_minimo",
            "stock_bajo",
            "iva_aplicable",
            "activo",
            "imagen",
            "imagen_url",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "stock", "created_at", "updated_at")
        extra_kwargs = {
            "costo": {"min_value": Decimal("0")},
            "precio": {"min_value": Decimal("0")},
            "stock_minimo": {"min_value": Decimal("0")},
        }

    def get_margen(self, obj: Producto) -> str | None:
        if not _puede_ver_costos(self.context.get("request")):
            return None
        return str(money(obj.margen))

    def get_imagen_url(self, obj: Producto) -> str | None:
        if not obj.imagen:
            return None
        request = self.context.get("request")
        url = obj.imagen.url
        return request.build_absolute_uri(url) if request else url

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not _puede_ver_costos(self.context.get("request")):
            data.pop("costo", None)
            data.pop("margen", None)
        return data

    def validate_sku(self, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise serializers.ValidationError("El SKU es obligatorio.")
        return value

    def validate_nombre(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El nombre es obligatorio.")
        return value

    def validate_imagen(self, value):
        if not value:
            return value
        content_type = getattr(value, "content_type", "")
        if content_type not in TIPOS_IMAGEN:
            raise serializers.ValidationError("La imagen debe ser PNG, JPG o WEBP.")
        if value.size > MAX_IMAGEN_BYTES:
            raise serializers.ValidationError("La imagen no puede superar los 2 MB.")
        return value

    def validate(self, attrs):
        if self.instance is not None and attrs.get("stock_inicial"):
            raise serializers.ValidationError(
                {"stock_inicial": "Para modificar el stock usa un ajuste de inventario."}
            )
        return attrs

    def create(self, validated_data):
        return crear_producto(validated_data, user=self.context["request"].user)

    def update(self, instance, validated_data):
        validated_data.pop("stock_inicial", None)
        return actualizar_producto(instance, validated_data, user=self.context["request"].user)


class ProductoResumenSerializer(serializers.ModelSerializer):
    unidad_abreviatura = serializers.CharField(source="unidad.abreviatura", read_only=True)

    class Meta:
        model = Producto
        fields = ("id", "sku", "nombre", "precio", "stock", "unidad_abreviatura")


class ComboProductoSerializer(serializers.ModelSerializer):
    producto = ProductoResumenSerializer(read_only=True)

    class Meta:
        model = ComboProducto
        fields = ("id", "producto", "cantidad")


class ComboComponenteInputSerializer(serializers.Serializer):
    producto = serializers.PrimaryKeyRelatedField(
        queryset=Producto.objects.filter(activo=True),
    )
    cantidad = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.001"),
    )


class ComboSerializer(serializers.ModelSerializer):
    componentes = ComboComponenteInputSerializer(many=True, write_only=True)
    detalle = ComboProductoSerializer(source="componentes", many=True, read_only=True)
    disponibilidad = serializers.SerializerMethodField()

    class Meta:
        model = Combo
        fields = (
            "id",
            "sku",
            "nombre",
            "precio",
            "activo",
            "componentes",
            "detalle",
            "disponibilidad",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")
        extra_kwargs = {"precio": {"min_value": Decimal("0")}}

    def get_disponibilidad(self, obj: Combo) -> int:
        return disponibilidad_combo(obj)

    def validate_sku(self, value: str) -> str:
        value = value.strip().upper()
        if not value:
            raise serializers.ValidationError("El SKU es obligatorio.")
        return value

    def validate_nombre(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El nombre es obligatorio.")
        return value

    def validate_componentes(self, value):
        if not value:
            raise serializers.ValidationError("Agrega al menos un componente al combo.")
        productos = [componente["producto"].pk for componente in value]
        if len(productos) != len(set(productos)):
            raise serializers.ValidationError("No repitas el mismo producto en el combo.")
        return value

    def create(self, validated_data):
        componentes = validated_data.pop("componentes")
        return crear_combo(validated_data, componentes, user=self.context["request"].user)

    def update(self, instance, validated_data):
        componentes = validated_data.pop("componentes", None)
        return actualizar_combo(
            instance,
            validated_data,
            componentes,
            user=self.context["request"].user,
        )


class MovimientoInventarioSerializer(serializers.ModelSerializer):
    producto_sku = serializers.CharField(source="producto.sku", read_only=True)
    producto_nombre = serializers.CharField(source="producto.nombre", read_only=True)
    tipo_display = serializers.CharField(source="get_tipo_display", read_only=True)
    direccion_display = serializers.CharField(source="get_direccion_display", read_only=True)
    signo = serializers.IntegerField(read_only=True)
    usuario = serializers.CharField(source="created_by.nombre", read_only=True, default=None)

    class Meta:
        model = MovimientoInventario
        fields = (
            "id",
            "producto",
            "producto_sku",
            "producto_nombre",
            "tipo",
            "tipo_display",
            "direccion",
            "direccion_display",
            "signo",
            "cantidad",
            "costo_unitario",
            "motivo",
            "referencia_tipo",
            "referencia_id",
            "usuario",
            "created_at",
        )
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not _puede_ver_costos(self.context.get("request")):
            data.pop("costo_unitario", None)
        return data


class AjusteInventarioSerializer(serializers.Serializer):
    producto = serializers.PrimaryKeyRelatedField(
        queryset=Producto.objects.filter(activo=True),
    )
    cantidad = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.001"),
    )
    direccion = serializers.ChoiceField(choices=MovimientoInventario.Direccion.choices)
    costo_unitario = serializers.DecimalField(
        max_digits=14,
        decimal_places=4,
        required=False,
        min_value=Decimal("0"),
    )
    motivo = serializers.CharField(max_length=200)

    def validate_motivo(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El motivo del ajuste es obligatorio.")
        return value

    def validate(self, attrs):
        request = self.context["request"]
        if attrs.get("costo_unitario") is not None and not _puede_ver_costos(request):
            raise serializers.ValidationError(
                {"costo_unitario": "Solo el administrador puede registrar costos."}
            )
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        return registrar_movimiento(
            validated_data["producto"],
            tipo=MovimientoInventario.Tipo.AJUSTE,
            direccion=validated_data["direccion"],
            cantidad=validated_data["cantidad"],
            costo_unitario=validated_data.get("costo_unitario"),
            motivo=validated_data["motivo"],
            user=request.user,
        )
