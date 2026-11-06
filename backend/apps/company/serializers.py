"""Serializers de empresa y tasas."""

from rest_framework import serializers

from .models import Empresa, TasaCambio


class EmpresaSerializer(serializers.ModelSerializer):
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = Empresa
        fields = (
            "id",
            "razon_social",
            "nombre_comercial",
            "rif",
            "representante",
            "direccion",
            "telefono",
            "email",
            "eslogan",
            "logo",
            "logo_url",
            "moneda_base",
            "iva_rate",
            "igtf_rate",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def get_logo_url(self, obj: Empresa) -> str | None:
        if not obj.logo:
            return None
        request = self.context.get("request")
        url = obj.logo.url
        return request.build_absolute_uri(url) if request else url

    def validate_moneda_base(self, value: str) -> str:
        value = value.strip().upper()
        if len(value) != 3 or not value.isalpha():
            raise serializers.ValidationError("Use un código ISO de 3 letras (ej. USD).")
        return value


class TasaCambioSerializer(serializers.ModelSerializer):
    class Meta:
        model = TasaCambio
        fields = ("id", "moneda", "tasa", "fuente", "vigente_desde", "created_at")
        read_only_fields = ("id", "created_at")

    def validate_moneda(self, value: str) -> str:
        value = value.strip().upper()
        if len(value) != 3 or not value.isalpha():
            raise serializers.ValidationError("Use un código ISO de 3 letras (ej. VES).")
        return value

    def validate_tasa(self, value):
        if value <= 0:
            raise serializers.ValidationError("La tasa debe ser mayor que cero.")
        return value
