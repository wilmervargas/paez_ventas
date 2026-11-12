"""Serializers de empresa y tasas."""

from rest_framework import serializers

from apps.common.fields import ImagenOpcionalField

from .models import Empresa, TasaCambio


class EmpresaSerializer(serializers.ModelSerializer):
    logo = ImagenOpcionalField(required=False, allow_null=True)
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
    es_calculada = serializers.BooleanField(read_only=True)

    class Meta:
        model = TasaCambio
        fields = (
            "id",
            "moneda",
            "moneda_base",
            "tasa",
            "fuente",
            "vigente_desde",
            "es_calculada",
            "created_at",
        )
        read_only_fields = ("id", "es_calculada", "created_at")

    def validate_moneda(self, value: str) -> str:
        return _validar_codigo(value, "moneda")

    def validate_moneda_base(self, value: str) -> str:
        if not value:
            # El modelo la completa con la moneda base de la empresa.
            return ""
        return _validar_codigo(value, "moneda_base")

    def validate_tasa(self, value):
        if value <= 0:
            raise serializers.ValidationError("La tasa debe ser mayor que cero.")
        return value

    def validate(self, attrs):
        moneda = attrs.get("moneda") or getattr(self.instance, "moneda", "VES")
        base = attrs.get("moneda_base")
        if base is None:
            base = getattr(self.instance, "moneda_base", "") or ""
        if base and moneda.strip().upper() == base.strip().upper():
            raise serializers.ValidationError(
                {"moneda_base": "La moneda base debe ser distinta de la moneda cotizada."}
            )
        return attrs


def _validar_codigo(value: str, campo: str) -> str:
    value = (value or "").strip().upper()
    if not (3 <= len(value) <= 4) or not value.isalpha():
        raise serializers.ValidationError(
            "Use un código de 3 o 4 letras (ej. VES, USD, EUR, USDT)."
        )
    return value


class ResumenTasaSerializer(serializers.Serializer):
    moneda = serializers.CharField()
    tasa = serializers.DecimalField(max_digits=18, decimal_places=6, allow_null=True)
    fuente = serializers.CharField(allow_null=True)
    vigente_desde = serializers.DateTimeField(allow_null=True)
    es_del_dia = serializers.BooleanField()
