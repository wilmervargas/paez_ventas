"""Tests de compras, recepción y anulación."""

from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.company.models import TasaCambio
from apps.inventory.models import MovimientoInventario
from apps.purchases.models import Compra

pytestmark = pytest.mark.django_db


def _payload(proveedor, producto, **overrides):
    payload = {
        "proveedor": proveedor.pk,
        "fecha": timezone.localdate().isoformat(),
        "moneda": "USD",
        "detalles": [
            {
                "producto": producto.pk,
                "cantidad": "10.000",
                "costo_unitario": "12.5000",
            }
        ],
        "notas": "Compra de prueba",
    }
    payload.update(overrides)
    return payload


def test_crear_compra_calcula_totales_y_numero_secuencial(
    admin_client, empresa, proveedor, producto
):
    response = admin_client.post(
        reverse("compra-list"),
        _payload(proveedor, producto),
        format="json",
    )

    assert response.status_code == 201
    anio = timezone.localdate().year
    assert response.data["numero"] == f"COMP-{anio}-000001"
    assert response.data["subtotal"] == "125.00"
    assert response.data["iva"] == "20.00"
    assert response.data["total"] == "145.00"
    assert response.data["total_base"] == "145.00"
    assert response.data["estado"] == "borrador"
    assert response.data["lineas"][0]["subtotal"] == "125.00"
    assert Compra.objects.count() == 1
    assert producto.stock == Decimal("0.000")


def test_numeracion_secuencial_por_anio(admin_client, empresa, proveedor, producto):
    primero = admin_client.post(
        reverse("compra-list"), _payload(proveedor, producto), format="json"
    )
    segundo = admin_client.post(
        reverse("compra-list"),
        _payload(proveedor, producto, notas="Segunda compra"),
        format="json",
    )

    anio = timezone.localdate().year
    assert primero.data["numero"] == f"COMP-{anio}-000001"
    assert segundo.data["numero"] == f"COMP-{anio}-000002"


def test_recibir_compra_actualiza_stock_y_costo_promedio(
    admin_client, empresa, proveedor, producto
):
    producto.stock = Decimal("5.000")
    producto.costo = Decimal("10.00")
    producto.save(update_fields=["stock", "costo"])

    creada = admin_client.post(
        reverse("compra-list"),
        _payload(proveedor, producto),
        format="json",
    )

    response = admin_client.post(
        reverse("compra-recibir", args=[creada.data["id"]]),
        format="json",
    )

    assert response.status_code == 200
    assert response.data["estado"] == "recibida"

    producto.refresh_from_db()
    assert producto.stock == Decimal("15.000")
    # (5 * 10 + 10 * 12.50) / 15 = 11.666... -> 11.67
    assert producto.costo == Decimal("11.67")

    movimiento = producto.movimientos.get(tipo=MovimientoInventario.Tipo.COMPRA)
    assert movimiento.direccion == MovimientoInventario.Direccion.ENTRADA
    assert movimiento.cantidad == Decimal("10.000")
    assert movimiento.referencia_tipo == "compra"
    assert movimiento.referencia_id == creada.data["id"]


def test_compra_recibida_no_se_edita(admin_client, empresa, proveedor, producto):
    creada = admin_client.post(reverse("compra-list"), _payload(proveedor, producto), format="json")
    admin_client.post(reverse("compra-recibir", args=[creada.data["id"]]), format="json")

    response = admin_client.patch(
        reverse("compra-detail", args=[creada.data["id"]]),
        {"notas": "Intento de edición"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "business_rule"


def test_anular_compra_recibida_revierte_inventario(admin_client, empresa, proveedor, producto):
    creada = admin_client.post(reverse("compra-list"), _payload(proveedor, producto), format="json")
    admin_client.post(reverse("compra-recibir", args=[creada.data["id"]]), format="json")

    response = admin_client.post(
        reverse("compra-anular", args=[creada.data["id"]]),
        {"motivo": "Mercancía defectuosa"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["estado"] == "anulada"
    assert response.data["motivo_anulacion"] == "Mercancía defectuosa"

    producto.refresh_from_db()
    assert producto.stock == Decimal("0.000")
    anulacion = producto.movimientos.get(tipo=MovimientoInventario.Tipo.ANULACION)
    assert anulacion.direccion == MovimientoInventario.Direccion.SALIDA

    repetida = admin_client.post(
        reverse("compra-anular", args=[creada.data["id"]]),
        {"motivo": "Otra vez"},
        format="json",
    )
    assert repetida.status_code == 400


def test_anular_borrador_no_genera_movimientos(admin_client, empresa, proveedor, producto):
    creada = admin_client.post(reverse("compra-list"), _payload(proveedor, producto), format="json")

    response = admin_client.post(
        reverse("compra-anular", args=[creada.data["id"]]),
        {"motivo": "Error de captura"},
        format="json",
    )

    assert response.status_code == 200
    assert MovimientoInventario.objects.count() == 0
    assert producto.stock == Decimal("0.000")


def test_compra_exige_motivo_para_anular(admin_client, empresa, proveedor, producto):
    creada = admin_client.post(reverse("compra-list"), _payload(proveedor, producto), format="json")

    response = admin_client.post(
        reverse("compra-anular", args=[creada.data["id"]]),
        {"motivo": "   "},
        format="json",
    )

    assert response.status_code == 400
    assert "motivo" in response.data["errors"]


def test_compra_rechaza_producto_repetido(admin_client, empresa, proveedor, producto):
    payload = _payload(proveedor, producto)
    payload["detalles"] = [
        {"producto": producto.pk, "cantidad": "1.000", "costo_unitario": "10.0000"},
        {"producto": producto.pk, "cantidad": "2.000", "costo_unitario": "10.0000"},
    ]

    response = admin_client.post(reverse("compra-list"), payload, format="json")

    assert response.status_code == 400
    assert "detalles" in response.data["errors"]


def test_compra_convierte_total_a_moneda_base_con_tasa(admin_client, empresa, proveedor, producto):
    response = admin_client.post(
        reverse("compra-list"),
        _payload(proveedor, producto, moneda="VES", tasa_cambio="40.000000"),
        format="json",
    )

    assert response.status_code == 201
    assert response.data["total"] == "145.00"
    assert response.data["total_base"] == "3.63"


def test_compra_en_moneda_extranjera_exige_tasa(admin_client, empresa, proveedor, producto):
    response = admin_client.post(
        reverse("compra-list"),
        _payload(proveedor, producto, moneda="VES"),
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "business_rule"


def test_compra_retroactiva_usa_la_tasa_de_su_fecha(admin_client, empresa, proveedor, producto):
    """Una compra con fecha pasada toma la tasa vigente de ese día, no la actual."""
    hace_3_dias = timezone.localdate() - timedelta(days=3)
    TasaCambio.objects.create(
        moneda="VES",
        tasa=Decimal("40.000000"),
        vigente_desde=timezone.make_aware(datetime.combine(hace_3_dias, time(9, 0))),
    )
    TasaCambio.objects.create(
        moneda="VES",
        tasa=Decimal("80.000000"),
        vigente_desde=timezone.make_aware(
            datetime.combine(timezone.localdate() - timedelta(days=1), time(9, 0))
        ),
    )

    response = admin_client.post(
        reverse("compra-list"),
        _payload(proveedor, producto, fecha=hace_3_dias.isoformat(), moneda="VES"),
        format="json",
    )

    assert response.status_code == 201
    assert response.data["tasa_cambio"] == "40.000000"
    assert response.data["total"] == "145.00"
    assert response.data["total_base"] == "3.63"  # 145 / 40


def test_compra_toma_la_ultima_tasa_registrada_del_dia(admin_client, empresa, proveedor, producto):
    """Si el día tiene correcciones, la compra usa la última vigente."""
    hoy = timezone.localdate()
    TasaCambio.objects.create(
        moneda="VES",
        tasa=Decimal("40.000000"),
        vigente_desde=timezone.make_aware(datetime.combine(hoy, time(9, 0))),
    )
    TasaCambio.objects.create(
        moneda="VES",
        tasa=Decimal("42.500000"),
        vigente_desde=timezone.make_aware(datetime.combine(hoy, time(15, 0))),
    )

    response = admin_client.post(
        reverse("compra-list"),
        _payload(proveedor, producto, moneda="VES"),
        format="json",
    )

    assert response.status_code == 201
    assert response.data["tasa_cambio"] == "42.500000"
    assert response.data["total_base"] == "3.41"  # 145 / 42.50


def test_compra_conserva_la_tasa_con_la_que_se_creo(admin_client, empresa, proveedor, producto):
    """Registrar una tasa nueva no reinterpreta compras ya guardadas."""
    hoy = timezone.localdate()
    TasaCambio.objects.create(
        moneda="VES",
        tasa=Decimal("40.000000"),
        vigente_desde=timezone.make_aware(datetime.combine(hoy, time(9, 0))),
    )

    creada = admin_client.post(
        reverse("compra-list"),
        _payload(proveedor, producto, moneda="VES"),
        format="json",
    )
    assert creada.data["tasa_cambio"] == "40.000000"
    assert creada.data["total_base"] == "3.63"  # 145 / 40

    TasaCambio.objects.create(
        moneda="VES",
        tasa=Decimal("80.000000"),
        vigente_desde=timezone.make_aware(datetime.combine(hoy, time(16, 0))),
    )

    detalle = admin_client.get(reverse("compra-detail", args=[creada.data["id"]]))

    assert detalle.status_code == 200
    assert detalle.data["tasa_cambio"] == "40.000000"
    assert detalle.data["total_base"] == "3.63"


def test_compra_permite_sobrescribir_la_tasa_del_dia(admin_client, empresa, proveedor, producto):
    """La tasa manual reemplaza a la del histórico y se congela en la compra."""
    hoy = timezone.localdate()
    TasaCambio.objects.create(
        moneda="VES",
        tasa=Decimal("40.000000"),
        vigente_desde=timezone.make_aware(datetime.combine(hoy, time(9, 0))),
    )

    response = admin_client.post(
        reverse("compra-list"),
        _payload(proveedor, producto, moneda="VES", tasa_cambio="50.000000"),
        format="json",
    )

    assert response.status_code == 201
    assert response.data["tasa_cambio"] == "50.000000"
    assert response.data["total_base"] == "2.90"  # 145 / 50


def test_compra_anterior_a_toda_tasa_es_rechazada(admin_client, empresa, proveedor, producto):
    """No hay tasa para la fecha del documento ni ninguna anterior: debe fallar."""
    hace_10_dias = timezone.localdate() - timedelta(days=10)
    TasaCambio.objects.create(
        moneda="VES",
        tasa=Decimal("40.000000"),
        vigente_desde=timezone.make_aware(
            datetime.combine(timezone.localdate() - timedelta(days=5), time(9, 0))
        ),
    )

    response = admin_client.post(
        reverse("compra-list"),
        _payload(proveedor, producto, fecha=hace_10_dias.isoformat(), moneda="VES"),
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "business_rule"


def test_compra_expone_montos_en_ves_y_usd_bcv(admin_client, empresa, proveedor, producto):
    """La compra en dólares muestra su equivalente en bolívares a la tasa BCV."""
    hoy = timezone.localdate()
    TasaCambio.objects.create(
        moneda="VES",
        moneda_base="USD",
        tasa=Decimal("40.000000"),
        fuente="bcv",
        vigente_desde=timezone.make_aware(datetime.combine(hoy, time(9, 0))),
    )

    response = admin_client.post(
        reverse("compra-list"),
        _payload(proveedor, producto, moneda="USD"),
        format="json",
    )

    assert response.status_code == 201
    assert response.data["tasa_bcv"] == "40.000000"
    assert response.data["total_usd"] == "145.00"
    assert response.data["total_ves"] == "5800.00"  # 145 * 40


def test_compra_en_bolivares_conserva_su_total_en_ves(admin_client, empresa, proveedor, producto):
    """Una compra hecha en Bs no se reinterpreta: su total ya está en Bs."""
    hoy = timezone.localdate()
    TasaCambio.objects.create(
        moneda="VES",
        moneda_base="USD",
        tasa=Decimal("40.000000"),
        fuente="bcv",
        vigente_desde=timezone.make_aware(datetime.combine(hoy, time(9, 0))),
    )

    response = admin_client.post(
        reverse("compra-list"),
        _payload(proveedor, producto, moneda="VES"),
        format="json",
    )

    assert response.status_code == 201
    assert response.data["tasa_cambio"] == "40.000000"
    assert response.data["tasa_bcv"] == "40.000000"
    assert response.data["total_usd"] == "3.63"
    assert response.data["total_ves"] == "145.00"


def test_compra_sin_tasa_bcv_no_inventa_bolivares(admin_client, empresa, proveedor, producto):
    """Sin tasa BCV registrada se omite el equivalente, no se asume una tasa."""
    response = admin_client.post(
        reverse("compra-list"),
        _payload(proveedor, producto, moneda="USD"),
        format="json",
    )

    assert response.status_code == 201
    assert response.data["tasa_bcv"] is None
    assert response.data["total_usd"] == "145.00"
    assert response.data["total_ves"] is None


def test_vendedor_no_accede_a_compras(auth_client, empresa, proveedor, producto):
    assert auth_client.get(reverse("compra-list")).status_code == 403
    assert (
        auth_client.post(
            reverse("compra-list"),
            _payload(proveedor, producto),
            format="json",
        ).status_code
        == 403
    )


def test_almacenista_gestiona_compras(almacenista_client, empresa, proveedor, producto):
    creada = almacenista_client.post(
        reverse("compra-list"),
        _payload(proveedor, producto),
        format="json",
    )

    assert creada.status_code == 201
    assert almacenista_client.get(reverse("compra-list")).status_code == 200
    assert (
        almacenista_client.post(
            reverse("compra-recibir", args=[creada.data["id"]]),
            format="json",
        ).status_code
        == 200
    )


def test_compra_no_se_elimina(admin_client, empresa, proveedor, producto):
    creada = admin_client.post(reverse("compra-list"), _payload(proveedor, producto), format="json")

    response = admin_client.delete(reverse("compra-detail", args=[creada.data["id"]]))

    assert response.status_code == 405
    assert Compra.objects.count() == 1
