"""Tests de pedidos de venta."""

from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.finances.models import Deuda
from apps.inventory.models import (
    Combo,
    ComboProducto,
    MovimientoInventario,
    Producto,
)
from apps.orders.models import Pedido

pytestmark = pytest.mark.django_db

CLIENTE_PAYLOAD = {
    "nombre": "Cliente de Prueba",
    "rif_cedula": "V-12345678",
    "telefono": "0414-1234567",
    "email": "cliente@example.com",
    "direccion": "Caracas",
}


def _crear_cliente(admin_client, empresa, **overrides):
    payload = {**CLIENTE_PAYLOAD, **overrides}
    return admin_client.post(reverse("cliente-list"), payload, format="json")


def _crear_producto(db, categoria, unidad, sku="PROD-001", precio="15.00", stock="10.000"):
    return Producto.objects.create(
        sku=sku,
        nombre=f"Producto {sku}",
        categoria=categoria,
        unidad=unidad,
        costo=Decimal("10.00"),
        precio=Decimal(precio),
        stock=Decimal(stock),
    )


def _crear_combo(db, categoria, unidad, sku="COMBO-001", precio="30.00"):
    combo = Combo.objects.create(
        sku=sku,
        nombre=f"Combo {sku}",
        precio=Decimal(precio),
    )
    return combo


def _pedido_payload(cliente, detalles, **overrides):
    payload = {
        "cliente": cliente.pk,
        "fecha": timezone.localdate().isoformat(),
        "moneda": "USD",
        "tipo_pago": "contado",
        "detalles": detalles,
        "notas": "Pedido de prueba",
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Creación en borrador (sin afectar stock)
# ---------------------------------------------------------------------------


def test_crear_pedido_borrador_no_afecta_stock(admin_client, empresa, cliente, producto):
    producto.stock = Decimal("10.000")
    producto.save(update_fields=["stock"])

    payload = _pedido_payload(
        cliente,
        [
            {
                "producto": producto.pk,
                "cantidad": "3.000",
                "precio_unitario": "15.00",
            }
        ],
    )
    response = admin_client.post(reverse("pedido-list"), payload, format="json")

    assert response.status_code == 201
    anio = timezone.localdate().year
    assert response.data["numero"] == f"PED-{anio}-000001"
    assert response.data["estado"] == "borrador"
    assert response.data["subtotal"] == "45.00"
    assert response.data["iva"] == "7.20"  # 45 * 16%
    assert response.data["total"] == "52.20"
    assert response.data["total_base"] == "52.20"

    producto.refresh_from_db()
    assert producto.stock == Decimal("10.000")  # sin cambios en borrador
    assert Pedido.objects.count() == 1


def test_numeracion_secuencial_por_anio(admin_client, empresa, cliente, producto):
    primero = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "1.000", "precio_unitario": "10.00"}],
        ),
        format="json",
    )
    segundo = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "1.000", "precio_unitario": "10.00"}],
            notas="Segundo pedido",
        ),
        format="json",
    )

    anio = timezone.localdate().year
    assert primero.data["numero"] == f"PED-{anio}-000001"
    assert segundo.data["numero"] == f"PED-{anio}-000002"


# ---------------------------------------------------------------------------
# Confirmación: descuenta stock de productos sueltos
# ---------------------------------------------------------------------------


def test_confirmar_pedido_descuenta_stock_producto_suelto(admin_client, empresa, cliente, producto):
    producto.stock = Decimal("10.000")
    producto.costo = Decimal("10.00")
    producto.save(update_fields=["stock", "costo"])

    creada = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "3.000", "precio_unitario": "15.00"}],
        ),
        format="json",
    )

    response = admin_client.post(
        reverse("pedido-confirmar", args=[creada.data["id"]]), format="json"
    )

    assert response.status_code == 200
    assert response.data["estado"] == "confirmado"

    producto.refresh_from_db()
    assert producto.stock == Decimal("7.000")

    movimiento = producto.movimientos.get(tipo=MovimientoInventario.Tipo.VENTA)
    assert movimiento.direccion == MovimientoInventario.Direccion.SALIDA
    assert movimiento.cantidad == Decimal("3.000")
    assert movimiento.referencia_tipo == "pedido"
    assert movimiento.referencia_id == creada.data["id"]


def test_confirmar_pedido_stock_insuficiente(admin_client, empresa, cliente, producto):
    producto.stock = Decimal("2.000")
    producto.save(update_fields=["stock"])

    creada = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "5.000", "precio_unitario": "15.00"}],
        ),
        format="json",
    )

    response = admin_client.post(
        reverse("pedido-confirmar", args=[creada.data["id"]]), format="json"
    )

    assert response.status_code == 400
    assert response.data["code"] == "business_rule"
    producto.refresh_from_db()
    assert producto.stock == Decimal("2.000")  # sin cambios


# ---------------------------------------------------------------------------
# Confirmación: descuenta stock de componentes de combo
# ---------------------------------------------------------------------------


def test_confirmar_pedido_combo_descuenta_componentes(
    admin_client, empresa, cliente, categoria, unidad
):
    producto_a = Producto.objects.create(
        sku="COMBO-A-001",
        nombre="Producto A",
        categoria=categoria,
        unidad=unidad,
        costo=Decimal("5.00"),
        precio=Decimal("10.00"),
        stock=Decimal("20.000"),
    )
    producto_b = Producto.objects.create(
        sku="COMBO-B-001",
        nombre="Producto B",
        categoria=categoria,
        unidad=unidad,
        costo=Decimal("8.00"),
        precio=Decimal("12.00"),
        stock=Decimal("10.000"),
    )
    combo = Combo.objects.create(
        sku="COMBO-001",
        nombre="Combo Familiar",
        precio=Decimal("30.00"),
    )
    ComboProducto.objects.create(combo=combo, producto=producto_a, cantidad=Decimal("2.000"))
    ComboProducto.objects.create(combo=combo, producto=producto_b, cantidad=Decimal("1.000"))

    creada = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"combo": combo.pk, "cantidad": "3.000", "precio_unitario": "30.00"}],
        ),
        format="json",
    )

    response = admin_client.post(
        reverse("pedido-confirmar", args=[creada.data["id"]]), format="json"
    )

    assert response.status_code == 200
    assert response.data["estado"] == "confirmado"

    producto_a.refresh_from_db()
    producto_b.refresh_from_db()
    # 3 combos × 2 unidades de A = 6; 20 - 6 = 14
    assert producto_a.stock == Decimal("14.000")
    # 3 combos × 1 unidad de B = 3; 10 - 3 = 7
    assert producto_b.stock == Decimal("7.000")


def test_confirmar_pedido_combo_stock_insuficiente_componente(
    admin_client, empresa, cliente, categoria, unidad
):
    producto_a = Producto.objects.create(
        sku="COMBO-C-001",
        nombre="Producto C",
        categoria=categoria,
        unidad=unidad,
        costo=Decimal("5.00"),
        precio=Decimal("10.00"),
        stock=Decimal("1.000"),
    )
    combo = Combo.objects.create(
        sku="COMBO-002",
        nombre="Combo Scarce",
        precio=Decimal("30.00"),
    )
    ComboProducto.objects.create(combo=combo, producto=producto_a, cantidad=Decimal("2.000"))

    creada = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"combo": combo.pk, "cantidad": "1.000", "precio_unitario": "30.00"}],
        ),
        format="json",
    )

    response = admin_client.post(
        reverse("pedido-confirmar", args=[creada.data["id"]]), format="json"
    )

    assert response.status_code == 400
    assert response.data["code"] == "business_rule"
    producto_a.refresh_from_db()
    assert producto_a.stock == Decimal("1.000")


# ---------------------------------------------------------------------------
# Anulación
# ---------------------------------------------------------------------------


def test_anular_pedido_confirmado_restaura_stock(admin_client, empresa, cliente, producto):
    producto.stock = Decimal("10.000")
    producto.save(update_fields=["stock"])

    creada = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "3.000", "precio_unitario": "15.00"}],
        ),
        format="json",
    )
    admin_client.post(reverse("pedido-confirmar", args=[creada.data["id"]]), format="json")

    producto.refresh_from_db()
    assert producto.stock == Decimal("7.000")

    response = admin_client.post(
        reverse("pedido-anular", args=[creada.data["id"]]),
        {"motivo": "Cliente se retiró"},
        format="json",
    )

    assert response.status_code == 200
    assert response.data["estado"] == "anulado"
    assert response.data["motivo_anulacion"] == "Cliente se retiró"

    producto.refresh_from_db()
    assert producto.stock == Decimal("10.000")  # restaurado
    anulacion = producto.movimientos.get(tipo=MovimientoInventario.Tipo.ANULACION)
    assert anulacion.direccion == MovimientoInventario.Direccion.ENTRADA


def test_anular_pedido_entregado_falla(admin_client, empresa, cliente, producto):
    producto.stock = Decimal("10.000")
    producto.save(update_fields=["stock"])

    creada = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "1.000", "precio_unitario": "15.00"}],
        ),
        format="json",
    )
    admin_client.post(reverse("pedido-confirmar", args=[creada.data["id"]]), format="json")
    admin_client.post(reverse("pedido-entregar", args=[creada.data["id"]]), format="json")

    response = admin_client.post(
        reverse("pedido-anular", args=[creada.data["id"]]),
        {"motivo": "No se puede"},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "business_rule"


def test_anular_pedido_ya_anulado_falla(admin_client, empresa, cliente, producto):
    creada = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "1.000", "precio_unitario": "15.00"}],
        ),
        format="json",
    )
    admin_client.post(
        reverse("pedido-anular", args=[creada.data["id"]]),
        {"motivo": "Primera vez"},
        format="json",
    )

    repetida = admin_client.post(
        reverse("pedido-anular", args=[creada.data["id"]]),
        {"motivo": "Segunda vez"},
        format="json",
    )

    assert repetida.status_code == 400
    assert repetida.data["code"] == "business_rule"


def test_anular_pedido_exige_motivo(admin_client, empresa, cliente, producto):
    creada = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "1.000", "precio_unitario": "15.00"}],
        ),
        format="json",
    )

    response = admin_client.post(
        reverse("pedido-anular", args=[creada.data["id"]]),
        {"motivo": "   "},
        format="json",
    )

    assert response.status_code == 400
    assert "motivo" in response.data["errors"]


# ---------------------------------------------------------------------------
# Entrega
# ---------------------------------------------------------------------------


def test_entregar_pedido_confirmado(admin_client, empresa, cliente, producto):
    producto.stock = Decimal("10.000")
    producto.save(update_fields=["stock"])

    creada = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "1.000", "precio_unitario": "15.00"}],
        ),
        format="json",
    )
    admin_client.post(reverse("pedido-confirmar", args=[creada.data["id"]]), format="json")

    response = admin_client.post(
        reverse("pedido-entregar", args=[creada.data["id"]]), format="json"
    )

    assert response.status_code == 200
    assert response.data["estado"] == "entregado"


def test_entregar_pedido_borrador_falla(admin_client, empresa, cliente, producto):
    creada = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "1.000", "precio_unitario": "15.00"}],
        ),
        format="json",
    )

    response = admin_client.post(
        reverse("pedido-entregar", args=[creada.data["id"]]), format="json"
    )

    assert response.status_code == 400
    assert response.data["code"] == "business_rule"


# ---------------------------------------------------------------------------
# Totales: IVA, descuento, redondeo, moneda extranjera
# ---------------------------------------------------------------------------


def test_pedido_con_descuento_y_iva(admin_client, empresa, cliente, producto):
    creada = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [
                {
                    "producto": producto.pk,
                    "cantidad": "2.000",
                    "precio_unitario": "100.00",
                    "descuento_linea": "10.00",
                }
            ],
            descuento="0.00",
        ),
        format="json",
    )

    assert creada.status_code == 201
    # (2 * 100 - 10) = 190 subtotal, IVA 16% = 30.40, total = 220.40
    assert creada.data["subtotal"] == "190.00"
    assert creada.data["descuento"] == "10.00"
    assert creada.data["iva"] == "30.40"
    assert creada.data["total"] == "220.40"


def test_pedido_moneda_extranjera_con_tasa(admin_client, empresa, cliente, producto):
    response = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "1.000", "precio_unitario": "100.00"}],
            moneda="VES",
            tasa_cambio="40.000000",
        ),
        format="json",
    )

    assert response.status_code == 201
    assert response.data["total"] == "116.00"  # 100 + 16% IVA
    assert response.data["total_base"] == "2.90"  # 116 / 40


def test_pedido_moneda_extranjera_sin_tasa_falla(admin_client, empresa, cliente, producto):
    response = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "1.000", "precio_unitario": "100.00"}],
            moneda="VES",
        ),
        format="json",
    )

    assert response.status_code == 400
    assert response.data["code"] == "business_rule"


# ---------------------------------------------------------------------------
# Pedido a crédito crea Deuda
# ---------------------------------------------------------------------------


def test_pedido_credito_crea_deuda(admin_client, empresa, cliente, producto):
    producto.stock = Decimal("10.000")
    producto.save(update_fields=["stock"])

    creada = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "1.000", "precio_unitario": "100.00"}],
            tipo_pago="credito",
        ),
        format="json",
    )
    admin_client.post(reverse("pedido-confirmar", args=[creada.data["id"]]), format="json")

    deuda = Deuda.objects.get(pedido=creada.data["id"])
    assert deuda.cliente_id == cliente.pk
    assert deuda.monto_original == Decimal("116.00")  # 100 + 16% IVA
    assert deuda.saldo == Decimal("116.00")
    assert deuda.estado == "pendiente"


# ---------------------------------------------------------------------------
# Permisos por rol
# ---------------------------------------------------------------------------


def test_vendedor_crea_y_confirma_pedido(auth_client, empresa, cliente, producto):
    producto.stock = Decimal("10.000")
    producto.save(update_fields=["stock"])

    creada = auth_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "1.000", "precio_unitario": "15.00"}],
        ),
        format="json",
    )
    assert creada.status_code == 201

    confirmada = auth_client.post(
        reverse("pedido-confirmar", args=[creada.data["id"]]), format="json"
    )
    assert confirmada.status_code == 200


def test_cobrador_no_crea_pedidos(cobrador_client, empresa, cliente, producto):
    response = cobrador_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "1.000", "precio_unitario": "15.00"}],
        ),
        format="json",
    )
    assert response.status_code == 403


def test_solo_admin_anula_pedido(admin_client, auth_client, empresa, cliente, producto):
    creada = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "1.000", "precio_unitario": "15.00"}],
        ),
        format="json",
    )

    # Vendedor no puede anular
    response = auth_client.post(
        reverse("pedido-anular", args=[creada.data["id"]]),
        {"motivo": "Intento vendedor"},
        format="json",
    )
    assert response.status_code == 403

    # Admin puede anular
    response = admin_client.post(
        reverse("pedido-anular", args=[creada.data["id"]]),
        {"motivo": "Motivo válido"},
        format="json",
    )
    assert response.status_code == 200


def test_pedido_no_se_elimina(admin_client, empresa, cliente, producto):
    creada = admin_client.post(
        reverse("pedido-list"),
        _pedido_payload(
            cliente,
            [{"producto": producto.pk, "cantidad": "1.000", "precio_unitario": "15.00"}],
        ),
        format="json",
    )

    response = admin_client.delete(reverse("pedido-detail", args=[creada.data["id"]]))

    assert response.status_code == 405
    assert Pedido.objects.count() == 1
