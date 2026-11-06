"""Tests de catálogo, combos, kardex y ajustes de inventario."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.inventory.models import Combo, MovimientoInventario, Producto

pytestmark = pytest.mark.django_db


def _producto_payload(categoria, unidad, **overrides):
    payload = {
        "sku": "PROD-100",
        "nombre": "Café molido",
        "categoria": categoria.pk,
        "unidad": unidad.pk,
        "costo": "10.00",
        "precio": "18.00",
        "stock_minimo": "1.000",
        "iva_aplicable": True,
        "stock_inicial": "5.000",
    }
    payload.update(overrides)
    return payload


def test_admin_crea_producto_y_stock_inicial_genera_kardex(
    admin_client, empresa, categoria, unidad
):
    response = admin_client.post(
        reverse("producto-list"),
        _producto_payload(categoria, unidad),
        format="json",
    )

    assert response.status_code == 201
    assert response.data["stock"] == "5.000"
    assert response.data["costo"] == "10.00"
    assert response.data["margen"] == "8.00"

    producto = Producto.objects.get(sku="PROD-100")
    assert producto.stock == Decimal("5.000")
    movimiento = producto.movimientos.get()
    assert movimiento.tipo == MovimientoInventario.Tipo.AJUSTE
    assert movimiento.direccion == MovimientoInventario.Direccion.ENTRADA
    assert movimiento.motivo == "Stock inicial"


def test_vendedor_ve_productos_sin_costo_ni_margen(
    admin_client, auth_client, empresa, categoria, unidad
):
    admin_client.post(reverse("producto-list"), _producto_payload(categoria, unidad), format="json")

    response = auth_client.get(reverse("producto-list"))

    assert response.status_code == 200
    assert response.data["count"] == 1
    item = response.data["results"][0]
    assert "costo" not in item
    assert "margen" not in item
    assert item["precio"] == "18.00"


def test_vendedor_y_almacenista_no_crean_productos(
    auth_client, almacenista_client, empresa, categoria, unidad
):
    payload = _producto_payload(categoria, unidad)

    assert auth_client.post(reverse("producto-list"), payload, format="json").status_code == 403
    assert (
        almacenista_client.post(reverse("producto-list"), payload, format="json").status_code == 403
    )
    assert almacenista_client.get(reverse("producto-list")).status_code == 200


def test_ajuste_salida_reduce_stock_y_no_permite_negativos(
    admin_client, almacenista_client, empresa, categoria, unidad
):
    admin_client.post(reverse("producto-list"), _producto_payload(categoria, unidad), format="json")
    producto = Producto.objects.get(sku="PROD-100")

    salida = almacenista_client.post(
        reverse("ajuste-inventario"),
        {
            "producto": producto.pk,
            "cantidad": "2.000",
            "direccion": "salida",
            "motivo": "Merma",
        },
        format="json",
    )
    assert salida.status_code == 201
    producto.refresh_from_db()
    assert producto.stock == Decimal("3.000")

    exceso = almacenista_client.post(
        reverse("ajuste-inventario"),
        {
            "producto": producto.pk,
            "cantidad": "4.000",
            "direccion": "salida",
            "motivo": "Merma",
        },
        format="json",
    )
    assert exceso.status_code == 400
    assert exceso.data["code"] == "business_rule"
    producto.refresh_from_db()
    assert producto.stock == Decimal("3.000")


def test_almacenista_no_puede_registrar_costos_en_ajustes(
    admin_client, almacenista_client, empresa, categoria, unidad
):
    admin_client.post(reverse("producto-list"), _producto_payload(categoria, unidad), format="json")
    producto = Producto.objects.get(sku="PROD-100")

    response = almacenista_client.post(
        reverse("ajuste-inventario"),
        {
            "producto": producto.pk,
            "cantidad": "1.000",
            "direccion": "entrada",
            "costo_unitario": "12.0000",
            "motivo": "Reposición",
        },
        format="json",
    )

    assert response.status_code == 400
    assert "costo_unitario" in response.data["errors"]


def test_vendedor_no_registra_ajustes(auth_client, empresa, producto):
    response = auth_client.post(
        reverse("ajuste-inventario"),
        {
            "producto": producto.pk,
            "cantidad": "1.000",
            "direccion": "entrada",
            "motivo": "Reposición",
        },
        format="json",
    )

    assert response.status_code == 403


def test_kardex_es_inmutable(admin_client, empresa, categoria, unidad):
    admin_client.post(reverse("producto-list"), _producto_payload(categoria, unidad), format="json")
    movimiento = MovimientoInventario.objects.get()

    detalle = reverse("movimiento-detail", args=[movimiento.pk])
    # El permiso de escritura está vacío y además el verbo no está expuesto.
    assert admin_client.put(detalle, {"motivo": "otro"}, format="json").status_code in (403, 405)
    assert admin_client.delete(detalle).status_code in (403, 405)
    movimiento.refresh_from_db()
    assert movimiento.motivo == "Stock inicial"


def test_vendedor_no_ve_costos_en_el_kardex(admin_client, auth_client, empresa, categoria, unidad):
    admin_client.post(reverse("producto-list"), _producto_payload(categoria, unidad), format="json")

    response = auth_client.get(reverse("movimiento-list"))

    assert response.status_code == 200
    assert "costo_unitario" not in response.data["results"][0]


def test_kardex_filtra_por_producto(admin_client, empresa, categoria, unidad):
    admin_client.post(reverse("producto-list"), _producto_payload(categoria, unidad), format="json")
    producto = Producto.objects.get(sku="PROD-100")

    response = admin_client.get(reverse("movimiento-list"), {"producto": producto.pk})

    assert response.status_code == 200
    assert response.data["count"] == 1


def test_kardex_filtra_por_rango_de_fechas(admin_client, empresa, categoria, unidad):
    admin_client.post(reverse("producto-list"), _producto_payload(categoria, unidad), format="json")
    hoy = timezone.localdate().isoformat()

    response = admin_client.get(
        reverse("movimiento-list"),
        {"fecha_desde": hoy, "fecha_hasta": hoy},
    )

    assert response.status_code == 200
    assert response.data["count"] == 1

    manana = (timezone.localdate() + timedelta(days=1)).isoformat()
    vacio = admin_client.get(
        reverse("movimiento-list"),
        {"fecha_desde": manana, "fecha_hasta": manana},
    )
    assert vacio.data["count"] == 0


def test_combo_calcula_disponibilidad_y_rechaza_repetidos(admin_client, empresa, categoria, unidad):
    primero = Producto.objects.create(
        sku="P-1",
        nombre="Producto 1",
        categoria=categoria,
        unidad=unidad,
        costo=Decimal("1.00"),
        precio=Decimal("2.00"),
        stock=Decimal("10.000"),
    )
    segundo = Producto.objects.create(
        sku="P-2",
        nombre="Producto 2",
        categoria=categoria,
        unidad=unidad,
        costo=Decimal("3.00"),
        precio=Decimal("5.00"),
        stock=Decimal("5.000"),
    )

    response = admin_client.post(
        reverse("combo-list"),
        {
            "sku": "COMBO-1",
            "nombre": "Combo de prueba",
            "precio": "25.00",
            "componentes": [
                {"producto": primero.pk, "cantidad": "2.000"},
                {"producto": segundo.pk, "cantidad": "1.000"},
            ],
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["disponibilidad"] == 5
    assert len(response.data["detalle"]) == 2
    assert Combo.objects.count() == 1

    repetido = admin_client.post(
        reverse("combo-list"),
        {
            "sku": "COMBO-2",
            "nombre": "Combo repetido",
            "precio": "10.00",
            "componentes": [
                {"producto": primero.pk, "cantidad": "1.000"},
                {"producto": primero.pk, "cantidad": "2.000"},
            ],
        },
        format="json",
    )
    assert repetido.status_code == 400


def test_combo_sin_componentes_es_rechazado(admin_client, empresa):
    response = admin_client.post(
        reverse("combo-list"),
        {
            "sku": "COMBO-VACIO",
            "nombre": "Combo vacío",
            "precio": "10.00",
            "componentes": [],
        },
        format="json",
    )

    assert response.status_code == 400
    assert "componentes" in response.data["errors"]


def test_productos_con_stock_bajo_se_listan(admin_client, empresa, categoria, unidad):
    admin_client.post(
        reverse("producto-list"),
        _producto_payload(categoria, unidad, stock_inicial="0.500", stock_minimo="1.000"),
        format="json",
    )
    admin_client.post(
        reverse("producto-list"),
        _producto_payload(
            categoria,
            unidad,
            sku="PROD-200",
            nombre="Producto con stock",
            stock_inicial="10.000",
        ),
        format="json",
    )

    response = admin_client.get(reverse("producto-stock-bajo"))

    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["sku"] == "PROD-100"


def test_no_se_puede_modificar_stock_por_patch(admin_client, empresa, categoria, unidad):
    creado = admin_client.post(
        reverse("producto-list"),
        _producto_payload(categoria, unidad),
        format="json",
    )

    response = admin_client.patch(
        reverse("producto-detail", args=[creado.data["id"]]),
        {"stock_inicial": "99.000"},
        format="json",
    )

    assert response.status_code == 400
    assert "stock_inicial" in response.data["errors"]
