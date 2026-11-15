"""Validación de filtros para los reportes."""

from rest_framework import serializers


class ReporteFiltrosSerializer(serializers.Serializer):
    """Filtros comunes a todos los reportes.

    Cada constructor ignora los campos que no aplican a su consulta.
    """

    desde = serializers.DateField(required=False)
    hasta = serializers.DateField(required=False)
    cliente = serializers.IntegerField(required=False, min_value=1)
    proveedor = serializers.IntegerField(required=False, min_value=1)
    categoria = serializers.IntegerField(required=False, min_value=1)
    producto = serializers.IntegerField(required=False, min_value=1)
    estado = serializers.CharField(required=False, allow_blank=True, max_length=20)
    moneda = serializers.CharField(required=False, allow_blank=True, max_length=4)
    tipo_pago = serializers.CharField(required=False, allow_blank=True, max_length=20)
    metodo = serializers.CharField(required=False, allow_blank=True, max_length=20)
    tipo = serializers.CharField(required=False, allow_blank=True, max_length=20)
    direccion = serializers.CharField(required=False, allow_blank=True, max_length=10)
    search = serializers.CharField(required=False, allow_blank=True, max_length=100)
    solo_vencidas = serializers.BooleanField(required=False, default=False)
    solo_bajo_stock = serializers.BooleanField(required=False, default=False)
    incluir_anulados = serializers.BooleanField(required=False, default=False)
    incluir_inactivos = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        desde = attrs.get("desde")
        hasta = attrs.get("hasta")
        if desde and hasta and desde > hasta:
            raise serializers.ValidationError(
                {"hasta": "La fecha final no puede ser anterior a la inicial."}
            )
        return attrs
