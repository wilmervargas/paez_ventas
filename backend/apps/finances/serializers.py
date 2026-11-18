"""Serializers del módulo de finanzas."""

from decimal import Decimal

from django.db.models import Sum
from rest_framework import serializers

from apps.common.utils.money import money, to_decimal

from .models import CajaSesion, Cuota, Deuda, MovimientoCaja, Pago, PagoAplicacion
from .services import abrir_caja, anular_pago, cerrar_caja, registrar_pago


class CuotaSerializer(serializers.ModelSerializer):
    vencida = serializers.BooleanField(read_only=True)
    estado_display = serializers.CharField(source="get_estado_display", read_only=True)
    fecha_pago_real = serializers.SerializerMethodField()
    metodo_pago = serializers.SerializerMethodField()
    metodo_pago_display = serializers.SerializerMethodField()
    banco_pago = serializers.SerializerMethodField()
    referencia_pago = serializers.SerializerMethodField()

    class Meta:
        model = Cuota
        fields = (
            "id",
            "numero",
            "monto",
            "saldo",
            "monto_ves_actual",
            "tasa_recalculo",
            "tasa_tipo_recalculo",
            "fecha_recalculo_tasa",
            "fecha_vencimiento",
            "estado",
            "estado_display",
            "vencida",
            "fecha_pago_real",
            "metodo_pago",
            "metodo_pago_display",
            "banco_pago",
            "referencia_pago",
        )

    def _pagos_info(self, obj):
        if hasattr(obj, "_pagos_info_cache"):
            return obj._pagos_info_cache
        apps = [a for a in getattr(obj, "aplicaciones").all() if getattr(a, "pago", None) and not a.pago.anulado]
        if not apps:
            obj._pagos_info_cache = []
            return obj._pagos_info_cache
        # Más reciente primero por fecha de pago/id del pago
        apps.sort(key=lambda a: (a.pago.fecha_pago, a.pago_id), reverse=True)
        info = []
        seen = set()
        for app in apps:
            pago = app.pago
            key = (pago.id, pago.fecha_pago, pago.metodo)
            if key in seen:
                continue
            seen.add(key)
            info.append(
                {
                    "fecha_pago": pago.fecha_pago,
                    "metodo": pago.metodo,
                    "metodo_display": pago.get_metodo_display(),
                    "banco": (getattr(pago, "banco", "") or "").strip(),
                    "referencia": (getattr(pago, "referencia", "") or "").strip(),
                }
            )
        obj._pagos_info_cache = info
        return info

    def get_fecha_pago_real(self, obj):
        info = self._pagos_info(obj)
        return info[0]["fecha_pago"] if info else None

    def get_metodo_pago(self, obj):
        info = self._pagos_info(obj)
        return info[0]["metodo"] if info else None

    def get_metodo_pago_display(self, obj):
        info = self._pagos_info(obj)
        if not info:
            return None
        labels = [i["metodo_display"] for i in info]
        # únicos conservando orden
        out = []
        for l in labels:
            if l not in out:
                out.append(l)
        return ", ".join(out)

    def get_banco_pago(self, obj):
        info = self._pagos_info(obj)
        if not info:
            return None
        valores = [i["banco"] for i in info if i.get("banco")]
        out = []
        for v in valores:
            if v not in out:
                out.append(v)
        return ", ".join(out) if out else None

    def get_referencia_pago(self, obj):
        info = self._pagos_info(obj)
        if not info:
            return None
        valores = [i["referencia"] for i in info if i.get("referencia")]
        out = []
        for v in valores:
            if v not in out:
                out.append(v)
        return ", ".join(out) if out else None


class PagoAplicacionSerializer(serializers.ModelSerializer):
    cuota_numero = serializers.IntegerField(source="cuota.numero", read_only=True, default=None)

    class Meta:
        model = PagoAplicacion
        fields = ("id", "deuda", "cuota", "cuota_numero", "monto")


class PagoSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source="cliente.nombre", read_only=True)
    metodo_display = serializers.CharField(source="get_metodo_display", read_only=True)
    aplicaciones = PagoAplicacionSerializer(many=True, read_only=True)
    creado_por = serializers.CharField(source="created_by.nombre", read_only=True, default=None)
    deuda_id = serializers.IntegerField(write_only=True)
    aplicar_completo = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Pago
        fields = (
            "id",
            "numero",
            "cliente",
            "cliente_nombre",
            "deuda_id",
            "fecha_pago",
            "moneda",
            "tasa_cambio",
            "monto",
            "monto_base",
            "metodo",
            "metodo_display",
            "referencia",
            "banco",
            "telefono_origen",
            "monto_recibido_bs",
            "tasa_usada_bs",
            "nota",
            "caja_sesion",
            "anulado",
            "motivo_anulacion",
            "fecha_anulacion",
            "aplicaciones",
            "creado_por",
            "created_at",
            "aplicar_completo",
        )
        read_only_fields = (
            "id",
            "numero",
            "cliente",
            "monto_base",
            "caja_sesion",
            "anulado",
            "motivo_anulacion",
            "fecha_anulacion",
            "created_at",
        )

    def validate(self, attrs):
        deuda_id = attrs.get("deuda_id")
        try:
            attrs["deuda"] = Deuda.objects.get(pk=deuda_id)
        except Deuda.DoesNotExist as err:
            raise serializers.ValidationError({"deuda_id": "Deuda no encontrada."}) from err
        if not attrs.get("moneda"):
            attrs["moneda"] = attrs["deuda"].moneda
        if not attrs.get("tasa_cambio"):
            attrs["tasa_cambio"] = attrs["deuda"].tasa_cambio
        return attrs

    def create(self, validated_data):
        validated_data.pop("deuda_id", None)
        user = self.context["request"].user
        return registrar_pago(validated_data, user=user)


class AnularPagoSerializer(serializers.Serializer):
    motivo = serializers.CharField(max_length=500)

    def validate_motivo(self, value):
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Indica el motivo de la anulación.")
        return value

    def save(self, **kwargs):
        return anular_pago(
            self.context["pago"], self.validated_data["motivo"], user=self.context["request"].user
        )


class DeudaSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source="cliente.nombre", read_only=True)
    cliente_codigo = serializers.CharField(source="cliente.codigo", read_only=True)
    cliente_telefono = serializers.CharField(source="cliente.telefono", read_only=True)
    pedido_numero = serializers.CharField(source="pedido.numero", read_only=True)
    pedido_fecha = serializers.DateField(source="pedido.fecha", read_only=True)
    estado_display = serializers.CharField(source="get_estado_display", read_only=True)
    vencida = serializers.BooleanField(read_only=True)
    cuotas = CuotaSerializer(many=True, read_only=True)
    cuotas_total = serializers.SerializerMethodField()
    cuotas_pagadas = serializers.SerializerMethodField()
    cuotas_pendientes = serializers.SerializerMethodField()
    cuotas_vencidas = serializers.SerializerMethodField()
    proxima_cuota = serializers.SerializerMethodField()
    monto_pagado = serializers.SerializerMethodField()

    class Meta:
        model = Deuda
        fields = (
            "id",
            "cliente",
            "cliente_nombre",
            "cliente_codigo",
            "cliente_telefono",
            "pedido",
            "pedido_numero",
            "pedido_fecha",
            "moneda",
            "tasa_cambio",
            "tasa_bcv",
            "tasa_bcv_vigente_desde",
            "monto_original",
            "saldo",
            "saldo_bs",
            "saldo_base",
            "saldo_ves_actual",
            "fecha_recalculo_tasa",
            "monto_pagado",
            "fecha_emision",
            "fecha_vencimiento",
            "estado",
            "estado_display",
            "vencida",
            "cuotas_total",
            "cuotas_pagadas",
            "cuotas_pendientes",
            "cuotas_vencidas",
            "proxima_cuota",
            "cuotas",
            "created_at",
        )

    def _cuotas_list(self, obj):
        if hasattr(obj, "_cuotas_cache"):
            return obj._cuotas_cache
        obj._cuotas_cache = list(obj.cuotas.all())
        return obj._cuotas_cache

    def get_cuotas_total(self, obj):
        return len(self._cuotas_list(obj))

    def get_cuotas_pagadas(self, obj):
        return sum(1 for c in self._cuotas_list(obj) if c.estado == Cuota.Estado.PAGADA)

    def get_cuotas_pendientes(self, obj):
        return sum(1 for c in self._cuotas_list(obj) if c.estado != Cuota.Estado.PAGADA)

    def get_cuotas_vencidas(self, obj):
        return sum(1 for c in self._cuotas_list(obj) if c.vencida)

    def get_proxima_cuota(self, obj):
        for c in self._cuotas_list(obj):
            if c.saldo > 0:
                return CuotaSerializer(c).data
        return None

    def get_monto_pagado(self, obj):
        return str(money(to_decimal(obj.monto_original) - to_decimal(obj.saldo)))


class MovimientoCajaSerializer(serializers.ModelSerializer):
    tipo_display = serializers.CharField(source="get_tipo_display", read_only=True)

    class Meta:
        model = MovimientoCaja
        fields = (
            "id",
            "tipo",
            "tipo_display",
            "concepto",
            "monto",
            "moneda",
            "tasa_cambio",
            "monto_base",
            "metodo",
            "referencia_tipo",
            "referencia_id",
            "es_efectivo",
            "created_at",
        )


class CajaSesionSerializer(serializers.ModelSerializer):
    usuario_apertura_nombre = serializers.CharField(
        source="usuario_apertura.nombre", read_only=True
    )
    usuario_cierre_nombre = serializers.CharField(
        source="usuario_cierre.nombre", read_only=True, default=None
    )
    movimientos = MovimientoCajaSerializer(many=True, read_only=True)
    total_ingresos_efectivo = serializers.SerializerMethodField()
    total_egresos_efectivo = serializers.SerializerMethodField()
    saldo_esperado = serializers.SerializerMethodField()

    class Meta:
        model = CajaSesion
        fields = (
            "id",
            "usuario_apertura",
            "usuario_apertura_nombre",
            "fecha_apertura",
            "monto_inicial",
            "moneda",
            "usuario_cierre",
            "usuario_cierre_nombre",
            "fecha_cierre",
            "monto_final_declarado",
            "monto_sistema",
            "diferencia",
            "observaciones",
            "estado",
            "total_ingresos_efectivo",
            "total_egresos_efectivo",
            "saldo_esperado",
            "movimientos",
            "created_at",
        )

    def _totales(self, obj):
        if hasattr(obj, "_totales_cache"):
            return obj._totales_cache
        qs = obj.movimientos.filter(es_efectivo=True)
        ing = qs.filter(tipo=MovimientoCaja.Tipo.INGRESO).aggregate(s=Sum("monto"))["s"] or Decimal(
            "0"
        )
        egr = qs.filter(tipo=MovimientoCaja.Tipo.EGRESO).aggregate(s=Sum("monto"))["s"] or Decimal(
            "0"
        )
        esperado = money(to_decimal(obj.monto_inicial) + to_decimal(ing) - to_decimal(egr))
        obj._totales_cache = (str(money(ing)), str(money(egr)), str(esperado))
        return obj._totales_cache

    def get_total_ingresos_efectivo(self, obj):
        return self._totales(obj)[0]

    def get_total_egresos_efectivo(self, obj):
        return self._totales(obj)[1]

    def get_saldo_esperado(self, obj):
        return self._totales(obj)[2]


class AbrirCajaSerializer(serializers.Serializer):
    monto_inicial = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=Decimal("0")
    )
    moneda = serializers.CharField(max_length=10, required=False, default="USD")

    def save(self, **kwargs):
        return abrir_caja(self.validated_data, user=self.context["request"].user)


class CerrarCajaSerializer(serializers.Serializer):
    monto_final_declarado = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=Decimal("0")
    )
    observaciones = serializers.CharField(required=False, allow_blank=True, default="")

    def save(self, **kwargs):
        return cerrar_caja(
            self.context["sesion"],
            self.validated_data["monto_final_declarado"],
            self.validated_data.get("observaciones", ""),
            user=self.context["request"].user,
        )
