"""Tests de configuración de empresa, tasas y gate fiscal."""

from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.urls import reverse
from django.utils import timezone

from apps.company.models import Empresa, TasaCambio

pytestmark = pytest.mark.django_db

EMPRESA_PAYLOAD = {
    "razon_social": "Páez Servicios, C.A.",
    "nombre_comercial": "Páez Servicios",
    "rif": "J-12345678-9",
    "representante": "Wilmer Vargas",
    "direccion": "Caracas, Venezuela",
    "telefono": "+584141234567",
    "email": "contacto@paez.example",
    "moneda_base": "usd",
    "iva_rate": "16.00",
}


def test_gate_bloquea_endpoints_sin_empresa(auth_client):
    response = auth_client.get("/api/v1/tasas-cambio/")

    assert response.status_code == 409
    assert response.data["code"] == "company_setup_required"


def test_company_get_sin_configurar_devuelve_404(auth_client):
    response = auth_client.get(reverse("empresa"))

    assert response.status_code == 404
    assert response.data["code"] == "company_not_configured"


def test_solo_admin_configura_la_empresa(auth_client):
    response = auth_client.put(reverse("empresa"), EMPRESA_PAYLOAD, format="json")

    assert response.status_code == 403


def test_admin_configura_empresa_y_se_libera_el_gate(admin_client, auth_client):
    response = admin_client.put(reverse("empresa"), EMPRESA_PAYLOAD, format="json")

    assert response.status_code == 201
    assert Empresa.objects.count() == 1
    assert response.data["rif"] == "J-12345678-9"
    assert response.data["moneda_base"] == "USD"

    assert auth_client.get(reverse("empresa")).status_code == 200
    assert auth_client.get("/api/v1/tasas-cambio/").status_code == 200


def test_empresa_es_singleton(admin_client):
    first = admin_client.put(reverse("empresa"), EMPRESA_PAYLOAD, format="json")
    assert first.status_code == 201

    payload = {**EMPRESA_PAYLOAD, "nombre_comercial": "Nuevo Nombre"}
    second = admin_client.put(reverse("empresa"), payload, format="json")

    assert second.status_code == 200
    assert Empresa.objects.count() == 1
    assert second.data["nombre_comercial"] == "Nuevo Nombre"


def test_empresa_con_timestamps_corruptos_se_puede_actualizar(admin_client):
    created = admin_client.put(reverse("empresa"), EMPRESA_PAYLOAD, format="json")
    assert created.status_code == 201

    # Simula una fila cargada manualmente en SQLite sin timestamps válidos.
    with connection.cursor() as cursor:
        cursor.execute("UPDATE company_empresa SET created_at = 0, updated_at = '' WHERE id = 1")

    payload = {**EMPRESA_PAYLOAD, "nombre_comercial": "Nombre Corregido"}
    response = admin_client.patch(reverse("empresa"), payload, format="json")

    assert response.status_code == 200
    assert response.data["nombre_comercial"] == "Nombre Corregido"
    assert response.data["created_at"] is not None


def _png() -> bytes:
    """Imagen PNG mínima y válida para pruebas de subida."""
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (4, 4), "blue").save(buffer, format="PNG")
    return buffer.getvalue()


def test_admin_crea_tasa_y_consulta_la_vigente(admin_client, empresa):
    response = admin_client.post(
        reverse("tasa-cambio-list"),
        {"moneda": "ves", "tasa": "40.500000", "fuente": "manual"},
        format="json",
    )

    assert response.status_code == 201
    assert response.data["moneda"] == "VES"

    vigente = admin_client.get(reverse("tasa-cambio-vigente"), {"moneda": "VES"})
    assert vigente.status_code == 200
    assert vigente.data["tasa"] == "40.500000"


def test_admin_crea_empresa_sin_logo(admin_client):
    response = admin_client.put(reverse("empresa"), EMPRESA_PAYLOAD, format="json")

    assert response.status_code == 201
    assert response.data["logo"] is None
    assert response.data["logo_url"] is None


def test_admin_sube_y_quita_logo_de_la_empresa(admin_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path

    logo = SimpleUploadedFile("logo.png", _png(), content_type="image/png")
    creada = admin_client.put(
        reverse("empresa"),
        {**EMPRESA_PAYLOAD, "logo": logo},
        format="multipart",
    )
    assert creada.status_code == 201
    assert creada.data["logo_url"]

    empresa = Empresa.get_solo()
    nombre_logo = empresa.logo.name
    assert default_storage.exists(nombre_logo)

    quitado = admin_client.patch(
        reverse("empresa"),
        {"logo": ""},
        format="multipart",
    )

    assert quitado.status_code == 200
    assert quitado.data["logo"] is None
    assert quitado.data["logo_url"] is None

    empresa.refresh_from_db()
    assert not empresa.logo.name
    assert not default_storage.exists(nombre_logo)


def test_admin_quita_logo_con_null_json(admin_client, settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path

    logo = SimpleUploadedFile("logo.png", _png(), content_type="image/png")
    admin_client.put(reverse("empresa"), {**EMPRESA_PAYLOAD, "logo": logo}, format="multipart")
    empresa = Empresa.get_solo()
    nombre_logo = empresa.logo.name

    quitado = admin_client.patch(reverse("empresa"), {"logo": None}, format="json")

    assert quitado.status_code == 200
    empresa.refresh_from_db()
    assert not empresa.logo.name
    assert not default_storage.exists(nombre_logo)


def test_vendedor_no_puede_crear_tasas(auth_client, empresa):
    response = auth_client.post(
        reverse("tasa-cambio-list"),
        {"moneda": "VES", "tasa": "40.5"},
        format="json",
    )

    assert response.status_code == 403


def test_tasa_invalida_es_rechazada(admin_client, empresa):
    response = admin_client.post(
        reverse("tasa-cambio-list"),
        {"moneda": "VES", "tasa": "0"},
        format="json",
    )

    assert response.status_code == 400


# --- Tasa del día: varias al día, arrastre y retroactivos ---


def _tasa(tasa: str, fecha, hora: int = 9) -> TasaCambio:
    """Registra una tasa a la hora local indicada de ese día."""
    return TasaCambio.objects.create(
        moneda="VES",
        tasa=Decimal(tasa),
        vigente_desde=timezone.make_aware(datetime.combine(fecha, time(hora, 0))),
    )


def test_varias_tasas_en_el_mismo_dia_aplica_la_ultima(admin_client, empresa):
    hoy = timezone.localdate()
    _tasa("40.000000", hoy, hora=9)
    _tasa("45.000000", hoy, hora=15)

    vigente = admin_client.get(reverse("tasa-cambio-vigente"), {"moneda": "VES"})

    assert vigente.status_code == 200
    assert vigente.data["tasa"] == "45.000000"


def test_dia_sin_tasa_arrastra_la_ultima_anterior(admin_client, empresa):
    ayer = timezone.localdate() - timedelta(days=1)
    _tasa("40.000000", ayer)

    vigente = admin_client.get(reverse("tasa-cambio-vigente"), {"moneda": "VES"})

    assert vigente.status_code == 200
    assert vigente.data["tasa"] == "40.000000"


def test_fecha_retroactiva_devuelve_la_tasa_de_ese_dia(admin_client, empresa):
    hace_3_dias = timezone.localdate() - timedelta(days=3)
    ayer = timezone.localdate() - timedelta(days=1)
    _tasa("40.000000", hace_3_dias)
    _tasa("50.000000", ayer)

    antigua = admin_client.get(
        reverse("tasa-cambio-vigente"),
        {"moneda": "VES", "fecha": hace_3_dias.isoformat()},
    )
    reciente = admin_client.get(
        reverse("tasa-cambio-vigente"),
        {"moneda": "VES", "fecha": ayer.isoformat()},
    )

    assert antigua.status_code == 200
    assert antigua.data["tasa"] == "40.000000"
    assert reciente.status_code == 200
    assert reciente.data["tasa"] == "50.000000"


def test_tasa_futura_no_se_aplica_hoy(admin_client, empresa):
    hoy = timezone.localdate()
    manana = timezone.localdate() + timedelta(days=1)
    _tasa("40.000000", hoy)
    _tasa("99.000000", manana, hora=8)

    hoy_resp = admin_client.get(reverse("tasa-cambio-vigente"), {"moneda": "VES"})
    manana_resp = admin_client.get(
        reverse("tasa-cambio-vigente"),
        {"moneda": "VES", "fecha": manana.isoformat()},
    )

    assert hoy_resp.status_code == 200
    assert hoy_resp.data["tasa"] == "40.000000"
    # Consultando la fecha futura sí se usa la tasa futura.
    assert manana_resp.data["tasa"] == "99.000000"


def test_fecha_invalida_en_tasa_vigente(admin_client, empresa):
    response = admin_client.get(
        reverse("tasa-cambio-vigente"),
        {"moneda": "VES", "fecha": "31-12-2026"},
    )

    assert response.status_code == 400
    assert response.data["code"] == "fecha_invalida"


def test_listado_de_tasas_filtra_por_fecha(admin_client, empresa):
    hoy = timezone.localdate()
    _tasa("40.000000", hoy, hora=9)
    _tasa("45.000000", hoy, hora=15)
    _tasa("30.000000", hoy - timedelta(days=2))

    del_dia = admin_client.get(
        reverse("tasa-cambio-list"),
        {"moneda": "VES", "fecha": hoy.isoformat()},
    )

    assert del_dia.status_code == 200
    assert del_dia.data["count"] == 2
    tasas = {item["tasa"] for item in del_dia.data["results"]}
    assert tasas == {"40.000000", "45.000000"}


# --- Histórico diario por moneda: USD, EUR y USDT ---


def _tasa_par(
    moneda_base: str,
    tasa: str,
    fecha,
    hora: int = 9,
    fuente: str = "bcv",
    moneda: str = "VES",
) -> TasaCambio:
    """Cotiza 1 unidad de `moneda_base` en `moneda` para el día indicado."""
    return TasaCambio.objects.create(
        moneda=moneda,
        moneda_base=moneda_base,
        tasa=Decimal(tasa),
        fuente=fuente,
        vigente_desde=timezone.make_aware(datetime.combine(fecha, time(hora, 0))),
    )


def test_la_moneda_base_se_toma_de_la_empresa_al_guardar(admin_client, empresa):
    response = admin_client.post(
        reverse("tasa-cambio-list"),
        {"moneda": "VES", "tasa": "36.500000"},
        format="json",
    )

    assert response.status_code == 201
    assert response.data["moneda_base"] == "USD"


def test_la_moneda_base_queda_congelada_en_la_tasa(empresa):
    hoy = timezone.localdate()
    tasa = TasaCambio.objects.create(
        moneda="VES",
        tasa=Decimal("40.000000"),
        vigente_desde=timezone.make_aware(datetime.combine(hoy, time(9, 0))),
    )
    assert tasa.moneda_base == "USD"

    empresa.moneda_base = "EUR"
    empresa.save()
    tasa.refresh_from_db()

    # Cambiar la moneda base de la empresa no reinterpreta el histórico.
    assert tasa.moneda_base == "USD"


def test_no_permite_cotizar_una_moneda_contra_si_misma(admin_client, empresa):
    response = admin_client.post(
        reverse("tasa-cambio-list"),
        {"moneda": "VES", "moneda_base": "VES", "tasa": "1.000000"},
        format="json",
    )

    assert response.status_code == 400
    assert "moneda_base" in response.data["errors"]


def test_euro_y_usdt_no_interfieren_con_la_tasa_del_dolar(admin_client, empresa):
    hoy = timezone.localdate()
    _tasa("40.000000", hoy)
    _tasa_par("EUR", "44.000000", hoy)
    _tasa_par("USDT", "42.000000", hoy, fuente="usdt")

    vigente = admin_client.get(reverse("tasa-cambio-vigente"), {"moneda": "VES"})

    assert vigente.status_code == 200
    assert vigente.data["tasa"] == "40.000000"
    assert vigente.data["moneda_base"] == "USD"


def test_resumen_devuelve_dolar_euro_y_usdt(admin_client, empresa):
    hoy = timezone.localdate()
    _tasa("40.000000", hoy)
    _tasa_par("EUR", "44.500000", hoy)
    _tasa_par("USDT", "42.250000", hoy, fuente="usdt")

    response = admin_client.get(reverse("tasa-cambio-resumen"))

    assert response.status_code == 200
    assert response.data["fecha"] == hoy.isoformat()
    filas = {fila["moneda"]: fila for fila in response.data["monedas"]}
    assert set(filas) == {"USD", "EUR", "USDT"}
    assert filas["USD"]["tasa"] == "40.000000"
    assert filas["EUR"]["tasa"] == "44.500000"
    assert filas["USDT"]["fuente"] == "usdt"
    assert all(fila["es_del_dia"] for fila in filas.values())


def test_resumen_marca_como_arrastrada_la_tasa_de_dias_anteriores(admin_client, empresa):
    ayer = timezone.localdate() - timedelta(days=1)
    _tasa("40.000000", ayer)

    response = admin_client.get(reverse("tasa-cambio-resumen"))

    assert response.status_code == 200
    filas = {fila["moneda"]: fila for fila in response.data["monedas"]}
    assert filas["USD"]["tasa"] == "40.000000"
    assert filas["USD"]["es_del_dia"] is False
    assert filas["EUR"]["tasa"] is None


def test_resumen_es_legible_para_cualquier_rol(auth_client, empresa):
    response = auth_client.get(reverse("tasa-cambio-resumen"))

    assert response.status_code == 200
    assert len(response.data["monedas"]) == 3


def test_vigente_permite_consultar_la_tasa_de_otra_base(admin_client, empresa):
    hoy = timezone.localdate()
    _tasa("40.000000", hoy)

    response = admin_client.get(
        reverse("tasa-cambio-vigente"),
        {"moneda": "VES", "base": "USD"},
    )

    assert response.status_code == 200
    assert response.data["tasa"] == "40.000000"


def test_tasa_cruzada_deriva_el_par_por_bolivares(admin_client, empresa):
    hoy = timezone.localdate()
    _tasa("40.000000", hoy)
    _tasa_par("EUR", "44.000000", hoy)

    response = admin_client.get(
        reverse("tasa-cambio-vigente"),
        {"moneda": "EUR", "base": "USD"},
    )

    assert response.status_code == 200
    # 1 USD = 40 Bs y 1 EUR = 44 Bs -> 1 USD = 0,909091 EUR.
    assert response.data["tasa"] == "0.909091"
    assert response.data["es_calculada"] is True


def test_tasa_cruzada_requiere_ambas_cotizaciones(admin_client, empresa):
    hoy = timezone.localdate()
    _tasa("40.000000", hoy)

    response = admin_client.get(
        reverse("tasa-cambio-vigente"),
        {"moneda": "EUR", "base": "USD"},
    )

    assert response.status_code == 404
    assert response.data["code"] == "tasa_no_configurada"


def test_listado_filtra_por_moneda_base(admin_client, empresa):
    hoy = timezone.localdate()
    _tasa("40.000000", hoy)
    _tasa_par("EUR", "44.000000", hoy)

    response = admin_client.get(reverse("tasa-cambio-list"), {"moneda_base": "EUR"})

    assert response.status_code == 200
    assert response.data["count"] == 1
    assert response.data["results"][0]["moneda_base"] == "EUR"
    assert response.data["results"][0]["moneda"] == "VES"
