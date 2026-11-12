"""Tests de catálogo, combos, kardex y ajustes de inventario."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone

from apps.inventory.models import (
    CategoriaProducto,
    Combo,
    ComboProducto,
    MovimientoInventario,
    Producto,
    UnidadMedida,
)

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


def _png() -> bytes:
    """Imagen PNG mínima y válida para pruebas de subida."""
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), "red").save(buffer, format="PNG")
    return buffer.getvalue()


def test_producto_se_crea_sin_imagen(admin_client, empresa, categoria, unidad):
    """La imagen es opcional: crear sin archivo debe funcionar igual."""
    response = admin_client.post(
        reverse("producto-list"),
        _producto_payload(categoria, unidad),
        format="json",
    )

    assert response.status_code == 201
    assert response.data["imagen"] is None
    assert response.data["imagen_url"] is None


def test_producto_sube_y_quita_imagen(admin_client, empresa, categoria, unidad, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path

    archivo = SimpleUploadedFile("cafe.png", _png(), content_type="image/png")
    creada = admin_client.post(
        reverse("producto-list"),
        {**_producto_payload(categoria, unidad), "imagen": archivo},
        format="multipart",
    )
    assert creada.status_code == 201
    assert creada.data["imagen_url"]

    producto = Producto.objects.get(sku="PROD-100")
    nombre_archivo = producto.imagen.name
    assert default_storage.exists(nombre_archivo)

    quitada = admin_client.patch(
        reverse("producto-detail", args=[producto.pk]),
        {"imagen": ""},
        format="multipart",
    )

    assert quitada.status_code == 200
    assert quitada.data["imagen"] is None
    assert quitada.data["imagen_url"] is None

    producto.refresh_from_db()
    assert not producto.imagen.name
    assert not default_storage.exists(nombre_archivo)


def test_producto_quita_imagen_con_null_json(
    admin_client, empresa, categoria, unidad, settings, tmp_path
):
    """`imagen: null` en JSON también significa borrar la imagen."""
    settings.MEDIA_ROOT = tmp_path

    archivo = SimpleUploadedFile("cafe.png", _png(), content_type="image/png")
    admin_client.post(
        reverse("producto-list"),
        {**_producto_payload(categoria, unidad), "imagen": archivo},
        format="multipart",
    )
    producto = Producto.objects.get(sku="PROD-100")
    nombre_archivo = producto.imagen.name

    quitada = admin_client.patch(
        reverse("producto-detail", args=[producto.pk]),
        {"imagen": None},
        format="json",
    )

    assert quitada.status_code == 200
    producto.refresh_from_db()
    assert not producto.imagen.name
    assert not default_storage.exists(nombre_archivo)


def test_producto_reemplazar_imagen_borra_la_anterior(
    admin_client, empresa, categoria, unidad, settings, tmp_path
):
    """Subir una imagen nueva no deja huérfano el archivo anterior."""
    settings.MEDIA_ROOT = tmp_path

    primera = SimpleUploadedFile("uno.png", _png(), content_type="image/png")
    admin_client.post(
        reverse("producto-list"),
        {**_producto_payload(categoria, unidad), "imagen": primera},
        format="multipart",
    )
    producto = Producto.objects.get(sku="PROD-100")
    nombre_previo = producto.imagen.name
    assert default_storage.exists(nombre_previo)

    segunda = SimpleUploadedFile("dos.png", _png(), content_type="image/png")
    reemplazo = admin_client.patch(
        reverse("producto-detail", args=[producto.pk]),
        {"imagen": segunda},
        format="multipart",
    )

    assert reemplazo.status_code == 200
    producto.refresh_from_db()
    assert producto.imagen.name != nombre_previo
    assert default_storage.exists(producto.imagen.name)
    assert not default_storage.exists(nombre_previo)


def test_producto_rechaza_imagen_invalida(admin_client, empresa, categoria, unidad):
    archivo = SimpleUploadedFile("virus.txt", b"no es una imagen", content_type="text/plain")

    response = admin_client.post(
        reverse("producto-list"),
        {**_producto_payload(categoria, unidad), "imagen": archivo},
        format="multipart",
    )

    assert response.status_code == 400
    assert "imagen" in response.data["errors"]


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


# --- Borrado físico de catálogo (solo sin vínculos) ---


def test_elimina_categoria_sin_productos(admin_client, empresa, categoria):
    response = admin_client.delete(reverse("categoria-producto-detail", args=[categoria.pk]))

    assert response.status_code == 204
    assert not CategoriaProducto.objects.filter(pk=categoria.pk).exists()


def test_no_elimina_categoria_con_productos(admin_client, empresa, categoria, producto):
    response = admin_client.delete(reverse("categoria-producto-detail", args=[categoria.pk]))

    assert response.status_code == 409
    assert response.data["code"] == "recurso_vinculado"
    assert CategoriaProducto.objects.filter(pk=categoria.pk).exists()


def test_vendedor_no_elimina_categorias(auth_client, empresa, categoria):
    response = auth_client.delete(reverse("categoria-producto-detail", args=[categoria.pk]))

    assert response.status_code == 403


def test_elimina_unidad_sin_productos(admin_client, empresa, unidad):
    response = admin_client.delete(reverse("unidad-medida-detail", args=[unidad.pk]))

    assert response.status_code == 204
    assert not UnidadMedida.objects.filter(pk=unidad.pk).exists()


def test_no_elimina_unidad_con_productos(admin_client, empresa, unidad, producto):
    response = admin_client.delete(reverse("unidad-medida-detail", args=[unidad.pk]))

    assert response.status_code == 409
    assert response.data["code"] == "recurso_vinculado"


def _producto_para_borrar(categoria, unidad, **overrides):
    from decimal import Decimal

    producto = Producto.objects.create(
        sku="P-DEL",
        nombre="Producto para borrar",
        categoria=categoria,
        unidad=unidad,
        costo=Decimal("1.00"),
        precio=Decimal("2.00"),
    )
    for field, value in overrides.items():
        setattr(producto, field, value)
    return producto


def test_elimina_producto_sin_historial(admin_client, empresa, categoria, unidad):
    producto = _producto_para_borrar(categoria, unidad)

    response = admin_client.delete(reverse("producto-detail", args=[producto.pk]))

    assert response.status_code == 204
    assert not Producto.objects.filter(pk=producto.pk).exists()


def test_elimina_producto_borra_su_imagen_fisica(
    admin_client, empresa, categoria, unidad, settings, tmp_path
):
    settings.MEDIA_ROOT = tmp_path
    producto = _producto_para_borrar(categoria, unidad)
    producto.imagen = SimpleUploadedFile("borrar.png", _png(), content_type="image/png")
    producto.save()
    nombre_imagen = producto.imagen.name
    assert default_storage.exists(nombre_imagen)

    response = admin_client.delete(reverse("producto-detail", args=[producto.pk]))

    assert response.status_code == 204
    assert not default_storage.exists(nombre_imagen)


def test_no_elimina_producto_con_movimientos(admin_client, empresa, categoria, unidad):
    producto = _producto_para_borrar(categoria, unidad)
    MovimientoInventario.objects.create(
        producto=producto,
        tipo=MovimientoInventario.Tipo.AJUSTE,
        direccion=MovimientoInventario.Direccion.ENTRADA,
        cantidad=Decimal("1.000"),
        motivo="Alta inicial",
    )

    response = admin_client.delete(reverse("producto-detail", args=[producto.pk]))

    assert response.status_code == 409
    assert response.data["code"] == "recurso_vinculado"
    assert Producto.objects.filter(pk=producto.pk).exists()


def test_no_elimina_producto_en_compras(admin_client, empresa, categoria, unidad, proveedor):
    from apps.purchases.models import Compra, CompraDetalle

    producto = _producto_para_borrar(categoria, unidad)
    compra = Compra.objects.create(
        numero="COMP-2026-000999",
        proveedor=proveedor,
        subtotal=Decimal("10.00"),
        iva=Decimal("0.00"),
        total=Decimal("10.00"),
    )
    CompraDetalle.objects.create(
        compra=compra,
        producto=producto,
        cantidad=Decimal("1.000"),
        costo_unitario=Decimal("10.0000"),
    )

    response = admin_client.delete(reverse("producto-detail", args=[producto.pk]))

    assert response.status_code == 409
    assert response.data["code"] == "recurso_vinculado"


def test_no_elimina_producto_componente_de_combo(admin_client, empresa, categoria, unidad):
    producto = _producto_para_borrar(categoria, unidad)
    combo = Combo.objects.create(sku="COMBO-DEL", nombre="Combo con P-DEL", precio=Decimal("5.00"))
    ComboProducto.objects.create(combo=combo, producto=producto, cantidad=Decimal("1.000"))

    response = admin_client.delete(reverse("producto-detail", args=[producto.pk]))

    assert response.status_code == 409
    assert response.data["code"] == "recurso_vinculado"


def test_elimina_combo_y_sus_componentes(admin_client, empresa, categoria, unidad):
    producto = _producto_para_borrar(categoria, unidad)
    combo = Combo.objects.create(sku="COMBO-DEL2", nombre="Combo borrable", precio=Decimal("5.00"))
    ComboProducto.objects.create(combo=combo, producto=producto, cantidad=Decimal("2.000"))

    response = admin_client.delete(reverse("combo-detail", args=[combo.pk]))

    assert response.status_code == 204
    assert not Combo.objects.filter(pk=combo.pk).exists()
    assert not ComboProducto.objects.exists()
    # El producto componente sobrevive: solo se borra el combo.
    assert Producto.objects.filter(pk=producto.pk).exists()


def test_vendedor_no_elimina_productos(auth_client, empresa, categoria, unidad, producto):
    response = auth_client.delete(reverse("producto-detail", args=[producto.pk]))

    assert response.status_code == 403
