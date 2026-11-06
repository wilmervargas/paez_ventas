"""Serializers de clientes y proveedores."""

from rest_framework import serializers
from rest_framework.validators import UniqueValidator

from apps.common.utils.phone import normalize_phone

from .models import Cliente, Proveedor
from .services import crear_cliente, crear_proveedor


def _normalizar_telefono(value: str) -> str:
    if not value:
        return ""
    normalizado = normalize_phone(value)
    if not normalizado:
        raise serializers.ValidationError(
            "Teléfono inválido. Usa el formato venezolano: 0414-1234567 o +584141234567."
        )
    return normalizado


class ClienteSerializer(serializers.ModelSerializer):
    codigo = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=20,
        validators=[UniqueValidator(queryset=Cliente.objects.all())],
    )

    class Meta:
        model = Cliente
        fields = (
            "id",
            "codigo",
            "nombre",
            "rif_cedula",
            "telefono",
            "telefono_alt",
            "email",
            "direccion",
            "limite_credito",
            "notas",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_codigo(self, value: str) -> str:
        value = value.strip().upper()
        if not value and self.instance is not None:
            return self.instance.codigo
        return value

    def validate_telefono(self, value: str) -> str:
        return _normalizar_telefono(value)

    def validate_telefono_alt(self, value: str) -> str:
        return _normalizar_telefono(value)

    def create(self, validated_data):
        user = self.context["request"].user
        return crear_cliente(validated_data, user=user)

    def validate_limite_credito(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("El límite de crédito no puede ser negativo.")
        return value

    def validate_nombre(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El nombre es obligatorio.")
        return value


class ProveedorSerializer(serializers.ModelSerializer):
    codigo = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=20,
        validators=[UniqueValidator(queryset=Proveedor.objects.all())],
    )

    class Meta:
        model = Proveedor
        fields = (
            "id",
            "codigo",
            "nombre",
            "rif",
            "telefono",
            "email",
            "direccion",
            "activo",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_codigo(self, value: str) -> str:
        value = value.strip().upper()
        if not value and self.instance is not None:
            return self.instance.codigo
        return value

    def validate_telefono(self, value: str) -> str:
        return _normalizar_telefono(value)

    def validate_nombre(self, value: str) -> str:
        value = value.strip()
        if not value:
            raise serializers.ValidationError("El nombre es obligatorio.")
        return value

    def create(self, validated_data):
        user = self.context["request"].user
        return crear_proveedor(validated_data, user=user)
