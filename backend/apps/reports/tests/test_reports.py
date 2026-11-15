"""Tests de los reportes y sus exportaciones."""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.common.utils.money import to_base
from apps.finances.models import Deuda, Pago
from apps.inventory.models import MovimientoInventario
from apps.orders.models import Pedido
from apps.purchases.models import Compra

pytestmark = pytest.mark.django_db


def _decimal(valor):
    return Decimal(str(valor))


def crear_pedido(cliente, **kwargs):
    datos = {
        "numero": "PED-2026-000001",
        "fecha": timezone.localdate(),
        "estado": Pedido.Estado.CONFIRMADO,
        "tipo_pago": Pedido.TipoPago.CONTADO,
        "moneda": "USD",
        "tasa_cambio": Decimal("1.000000"),
        "subtotal": Decimal("100.00"),
        "iva": Decimal("0.00"),
        "total": Decimal("100.00"),
        "total_base": Decimal("100.00"),
    }
    datos.update(kwargs)
    datos["total_base"] = to_base(datos["total"], datos["tasa_cambio"])
    return Pedido.objects.create(cliente=cliente, **datos)


def crear_deuda(pedido, **kwargs):
    datos = {
        "cliente": pedido.cliente,
        "pedido": pedido,
        "moneda": pedido.moneda,
        "tasa_cambio": pedido.tasa_cambio,
        "monto_original": pedido.total,
        "saldo": pedido.total,
    }
    datos.update(kwargs)
    return Deuda.objects.create(**datos)


def test_vendedor_ve_reporte_ventas(auth_client, empresa, cliente):
    crear_pedido(cliente)
    response = auth_client.get(reverse("reporte", args=["ventas"]))

    assert response.status_code == 200
    assert response.data["titulo"] == "Reporte de ventas"
    assert response.data["total_filas"] == 1
    assert response.data["filas"][0]["numero"] == "PED-2026-000001"


def test_almacenista_no_ve_ventas(almacenista_client, empresa):
    response = almacenista_client.get(reverse("reporte", args=["ventas"]))
    assert response.status_code == 403


def test_utilidad_solo_admin(admin_client, auth_client, empresa):
    assert auth_client.get(reverse("reporte", args=["utilidad"])).status_code == 403
    assert admin_client.get(reverse("reporte", args=["utilidad"])).status_code == 200


def test_inventario_oculta_costos_salvo_admin(admin_client, auth_client, empresa, producto):
    vendedor = auth_client.get(reverse("reporte", args=["inventario"]))
    admin = admin_client.get(reverse("reporte", args=["inventario"]))

    claves_vendedor = {col["key"] for col in vendedor.data["columnas"]}
    claves_admin = {col["key"] for col in admin.data["columnas"]}
    assert "costo" not in claves_vendedor
    assert "costo" in claves_admin


def test_rango_de_fechas_invertido_es_rechazado(admin_client, empresa):
    response = admin_client.get(
        reverse("reporte", args=["ventas"]),
        {"desde": "2026-11-10", "hasta": "2026-11-01"},
    )
    assert response.status_code == 400
    assert "hasta" in response.data["errors"]


def test_ventas_consolida_en_moneda_base(admin_client, empresa, cliente):
    crear_pedido(
        cliente,
        moneda="VES",
        tasa_cambio=Decimal("100.000000"),
        subtotal=Decimal("1000.00"),
        total=Decimal("1000.00"),
    )
    response = admin_client.get(reverse("reporte", args=["ventas"]))
    total = next(item for item in response.data["resumen"] if item["label"] == "Total facturado")

    assert response.data["filas"][0]["total_base"] == "10.00"
    assert total["value"] == "10.00"


def test_cxc_calcula_dias_vencida(admin_client, empresa, cliente):
    pedido = crear_pedido(cliente)
    crear_deuda(
        pedido,
        fecha_emision=timezone.localdate() - timedelta(days=40),
        fecha_vencimiento=timezone.localdate() - timedelta(days=10),
    )
    response = admin_client.get(reverse("reporte", args=["cxc"]))

    assert response.status_code == 200
    assert response.data["filas"][0]["dias_vencida"] == 10
    vencidas = next(
        item for item in response.data["resumen"] if item["label"] == "Cuentas vencidas"
    )
    assert vencidas["value"] == 1


def test_cobranza_excluye_anulados_por_defecto(admin_client, empresa, cliente):
    for indice, anulado in enumerate((False, True), start=1):
        Pago.objects.create(
            numero=f"PAG-2026-00000{indice}",
            cliente=cliente,
            moneda="USD",
            tasa_cambio=Decimal("1.000000"),
            monto=Decimal("50.00"),
            monto_base=Decimal("50.00"),
            metodo=Pago.Metodo.EFECTIVO,
            anulado=anulado,
        )

    normal = admin_client.get(reverse("reporte", args=["cobranza"]))
    con_anulados = admin_client.get(
        reverse("reporte", args=["cobranza"]), {"incluir_anulados": "true"}
    )

    assert normal.data["total_filas"] == 1
    assert con_anulados.data["total_filas"] == 2


def test_compras_se_pueden_filtrar_por_estado(admin_client, empresa, proveedor):
    Compra.objects.create(
        numero="COMP-2026-000001",
        proveedor=proveedor,
        estado=Compra.Estado.RECIBIDA,
        total=Decimal("100.00"),
        total_base=Decimal("100.00"),
    )
    Compra.objects.create(
        numero="COMP-2026-000002",
        proveedor=proveedor,
        estado=Compra.Estado.BORRADOR,
        total=Decimal("200.00"),
        total_base=Decimal("200.00"),
    )

    response = admin_client.get(
        reverse("reporte", args=["compras"]), {"estado": Compra.Estado.RECIBIDA}
    )
    assert response.data["total_filas"] == 1
    assert response.data["filas"][0]["numero"] == "COMP-2026-000001"


def test_movimientos_filtra_por_tipo(admin_client, empresa, producto):
    MovimientoInventario.objects.create(
        producto=producto,
        tipo=MovimientoInventario.Tipo.ENTRADA,
        direccion=MovimientoInventario.Direccion.ENTRADA,
        cantidad=Decimal("5.000"),
        costo_unitario=Decimal("10.0000"),
    )
    MovimientoInventario.objects.create(
        producto=producto,
        tipo=MovimientoInventario.Tipo.VENTA,
        direccion=MovimientoInventario.Direccion.SALIDA,
        cantidad=Decimal("2.000"),
        costo_unitario=Decimal("10.0000"),
    )

    response = admin_client.get(reverse("reporte", args=["movimientos"]), {"tipo": "venta"})
    assert response.data["total_filas"] == 1
    assert response.data["filas"][0]["tipo"] == "Venta"


def test_exportacion_pdf_y_xlsx(admin_client, empresa, cliente):
    crear_pedido(cliente)
    pdf = admin_client.get(reverse("reporte-export", args=["ventas", "pdf"]))
    xlsx = admin_client.get(reverse("reporte-export", args=["ventas", "xlsx"]))

    assert pdf.status_code == 200
    assert pdf["Content-Type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")
    assert "attachment" in pdf["Content-Disposition"]

    assert xlsx.status_code == 200
    assert xlsx["Content-Type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert xlsx.content.startswith(b"PK")


def test_formato_de_exportacion_invalido(admin_client, empresa):
    response = admin_client.get(reverse("reporte-export", args=["ventas", "csv"]))
    assert response.status_code == 404


def test_reporte_desconocido(admin_client, empresa):
    assert admin_client.get(reverse("reporte", args=["inexistente"])).status_code == 404


def test_cxc_incluye_solo_pendientes_si_se_pide(admin_client, empresa, cliente):
    pedido = crear_pedido(cliente)
    deuda = crear_deuda(pedido, saldo=Decimal("0.00"), estado=Deuda.Estado.PAGADA)
    crear_deuda(
        crear_pedido(cliente, numero="PED-2026-000002"),
        fecha_vencimiento=timezone.localdate() - timedelta(days=5),
    )

    response = admin_client.get(reverse("reporte", args=["cxc"]), {"solo_vencidas": "true"})
    numeros = {fila["pedido"] for fila in response.data["filas"]}
    assert deuda.pedido.numero not in numeros
    assert numeros == {"PED-2026-000002"}


def test_empresa_sin_configurar_bloquea_reportes(admin_client):
    from apps.company.models import Empresa

    Empresa.objects.all().delete()
    response = admin_client.get(reverse("reporte", args=["ventas"]))
    assert response.status_code == 409
    assert response.data["code"] == "company_setup_required"
