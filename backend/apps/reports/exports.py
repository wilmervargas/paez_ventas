"""Exportadores de reportes a PDF y Excel."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from xml.sax.saxutils import escape

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from apps.company.models import Empresa
from apps.company.services import get_moneda_base

# ---------------------------------------------------------------------------
# Formato común
# ---------------------------------------------------------------------------

TIPO_DECIMALES = {
    "money": 2,
    "qty": 3,
    "rate": 6,
    "percent": 2,
}


def _decimal(value) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def _locale_number(value, places: int) -> str:
    """Formatea 1234.5 como 1.234,50 (estilo es-VE)."""
    texto = f"{_decimal(value):,.{places}f}"
    return texto.translate(str.maketrans({",": ".", ".": ","}))


def _texto_celda(value, tipo: str) -> str:
    if value in (None, ""):
        return "—"
    if tipo == "money":
        return _locale_number(value, 2)
    if tipo == "qty":
        return _locale_number(value, 3)
    if tipo == "rate":
        return _locale_number(value, 6)
    if tipo == "percent":
        return f"{_locale_number(value, 2)} %"
    if tipo == "int":
        return _locale_number(value, 0)
    if tipo == "date":
        try:
            return date.fromisoformat(str(value)[:10]).strftime("%d/%m/%Y")
        except ValueError:
            return str(value)
    if tipo == "datetime":
        try:
            return datetime.fromisoformat(str(value)).strftime("%d/%m/%Y %H:%M")
        except ValueError:
            return str(value)
    return str(value)


def _empresa_datos() -> tuple[str, str, str]:
    empresa = Empresa.get_solo()
    if empresa is None:
        return "Sistema de gestión", "", get_moneda_base(None)
    nombre = empresa.nombre_comercial or empresa.razon_social
    return nombre, empresa.rif, get_moneda_base(empresa)


def _linea_filtros(payload: dict) -> str:
    pares = [f"{item['label']}: {item['value']}" for item in payload["filtros_aplicados"]]
    return " · ".join(pares) if pares else "Sin filtros adicionales"


def _generado(payload: dict) -> str:
    try:
        return datetime.fromisoformat(payload["generado_en"]).strftime("%d/%m/%Y %H:%M")
    except ValueError:
        return ""


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------


class _NumberedCanvas(canvas.Canvas):
    """Canvas con «Página X de Y» en el pie de cada página."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._pie(total)
            super().showPage()
        super().save()

    def _pie(self, total: int):
        self.saveState()
        self.setFont("Helvetica", 7)
        self.setFillColor(colors.HexColor("#64748b"))
        self.drawString(10 * mm, 7 * mm, "Sistema de gestión comercial")
        self.drawRightString(
            landscape(A4)[0] - 10 * mm,
            7 * mm,
            f"Página {self._pageNumber} de {total}",
        )
        self.restoreState()


def _estilos_pdf():
    base = getSampleStyleSheet()["Normal"]
    return {
        "titulo": ParagraphStyle(
            "titulo",
            parent=base,
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=17,
            textColor=colors.HexColor("#1e293b"),
        ),
        "empresa": ParagraphStyle(
            "empresa",
            parent=base,
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#334155"),
        ),
        "meta": ParagraphStyle(
            "meta",
            parent=base,
            fontName="Helvetica",
            fontSize=7.5,
            leading=10,
            textColor=colors.HexColor("#64748b"),
        ),
        "head": ParagraphStyle(
            "head",
            parent=base,
            fontName="Helvetica-Bold",
            fontSize=6.8,
            leading=8.2,
            textColor=colors.white,
        ),
        "head_right": ParagraphStyle(
            "head_right",
            parent=base,
            fontName="Helvetica-Bold",
            fontSize=6.8,
            leading=8.2,
            textColor=colors.white,
            alignment=TA_RIGHT,
        ),
        "cell": ParagraphStyle(
            "cell",
            parent=base,
            fontName="Helvetica",
            fontSize=6.5,
            leading=7.8,
            textColor=colors.HexColor("#0f172a"),
        ),
        "cell_right": ParagraphStyle(
            "cell_right",
            parent=base,
            fontName="Helvetica",
            fontSize=6.5,
            leading=7.8,
            textColor=colors.HexColor("#0f172a"),
            alignment=TA_RIGHT,
        ),
        "total": ParagraphStyle(
            "total",
            parent=base,
            fontName="Helvetica-Bold",
            fontSize=6.8,
            leading=8.2,
            textColor=colors.HexColor("#0f172a"),
        ),
        "total_right": ParagraphStyle(
            "total_right",
            parent=base,
            fontName="Helvetica-Bold",
            fontSize=6.8,
            leading=8.2,
            textColor=colors.HexColor("#0f172a"),
            alignment=TA_RIGHT,
        ),
    }


def _peso_columna(col: dict) -> float:
    tipo = col.get("type", "text")
    if tipo == "text":
        if col.get("key") in {"cliente", "producto", "descripcion", "motivo", "proveedor"}:
            return 2.4
        return 1.6
    if tipo in {"date", "datetime"}:
        return 1.15 if tipo == "date" else 1.35
    if tipo == "money":
        return 1.25
    if tipo == "rate":
        return 1.05
    if tipo == "qty":
        return 1.05
    if tipo == "percent":
        return 0.9
    if tipo == "int":
        return 0.8
    return 1.1


def render_pdf(payload: dict, empresa=None) -> bytes:
    estilos = _estilos_pdf()
    buffer = BytesIO()
    pagina = landscape(A4)
    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagina,
        leftMargin=9 * mm,
        rightMargin=9 * mm,
        topMargin=10 * mm,
        bottomMargin=12 * mm,
        title=payload["titulo"],
        author=_empresa_datos()[0],
    )

    nombre, rif, moneda = _empresa_datos()
    elementos = [
        Paragraph(escape(nombre), estilos["empresa"]),
    ]
    if rif:
        elementos.append(Paragraph(f"RIF {escape(rif)}", estilos["meta"]))
    elementos.append(Spacer(1, 2 * mm))
    elementos.append(Paragraph(escape(payload["titulo"]), estilos["titulo"]))
    elementos.append(Spacer(1, 1 * mm))
    elementos.append(
        Paragraph(
            f"Generado: {_generado(payload)} · Moneda base: {escape(moneda)} · "
            f"Registros: {payload['total_filas']}",
            estilos["meta"],
        )
    )
    elementos.append(Paragraph(escape(_linea_filtros(payload)), estilos["meta"]))
    elementos.append(Spacer(1, 3 * mm))

    columnas = payload["columnas"]
    pesos = [_peso_columna(col) for col in columnas]
    ancho_disponible = pagina[0] - 18 * mm
    unidad = ancho_disponible / sum(pesos)
    anchos = [peso * unidad for peso in pesos]

    cabecera = []
    for col in columnas:
        estilo = estilos["head_right"] if col.get("align") == "right" else estilos["head"]
        cabecera.append(Paragraph(escape(col["label"]), estilo))

    datos = [cabecera]
    for fila in payload["filas"]:
        celdas = []
        for col in columnas:
            valor = _texto_celda(fila.get(col["key"]), col.get("type", "text"))
            estilo = estilos["cell_right"] if col.get("align") == "right" else estilos["cell"]
            celdas.append(Paragraph(escape(valor), estilo))
        datos.append(celdas)

    totales = payload.get("fila_totales") or {}
    hay_totales = bool(totales)
    if hay_totales:
        fila_total = [Paragraph("TOTALES", estilos["total"])]
        for col in columnas[1:]:
            valor = totales.get(col["key"])
            texto = _texto_celda(valor, col.get("type", "text")) if valor not in (None, "") else ""
            estilo = estilos["total_right"] if col.get("align") == "right" else estilos["total"]
            fila_total.append(Paragraph(escape(texto), estilo))
        datos.append(fila_total)

    tabla = Table(datos, colWidths=anchos, repeatRows=1)
    estilos_tabla = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e2e8f0")),
        ("LEFTPADDING", (0, 0), (-1, -1), 2.5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2.5),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]
    for indice in range(1, len(datos)):
        if hay_totales and indice == len(datos) - 1:
            estilos_tabla.append(
                ("BACKGROUND", (0, indice), (-1, indice), colors.HexColor("#e2e8f0"))
            )
        elif indice % 2 == 0:
            estilos_tabla.append(
                ("BACKGROUND", (0, indice), (-1, indice), colors.HexColor("#f8fafc"))
            )
    tabla.setStyle(TableStyle(estilos_tabla))
    elementos.append(tabla)

    if not payload["filas"]:
        elementos.append(Spacer(1, 4 * mm))
        elementos.append(
            Paragraph(
                "No hay registros para los filtros seleccionados.",
                estilos["meta"],
            )
        )

    doc.build(elementos, canvasmaker=_NumberedCanvas)
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Excel
# ---------------------------------------------------------------------------


def _excel_valor(value, tipo: str):
    if value in (None, ""):
        return None
    if tipo in TIPO_DECIMALES:
        return _decimal(value)
    if tipo == "int":
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
    if tipo == "date":
        try:
            return date.fromisoformat(str(value)[:10])
        except ValueError:
            return str(value)
    if tipo == "datetime":
        try:
            valor = datetime.fromisoformat(str(value))
        except ValueError:
            return str(value)
        # Excel no admite zonas horarias en celdas de fecha/hora.
        return valor.replace(tzinfo=None) if valor.tzinfo else valor
    return str(value)


def _ancho_excel(value) -> int:
    if value is None:
        return 0
    if isinstance(value, datetime):
        return 16
    if isinstance(value, date):
        return 12
    return len(str(value))


def render_xlsx(payload: dict, empresa=None) -> bytes:
    nombre, rif, moneda = _empresa_datos()
    libro = Workbook()
    hoja = libro.active
    hoja.title = payload["titulo"][:31]

    hoja["A1"] = nombre
    hoja["A1"].font = Font(bold=True, size=14, color="1E293B")
    posicion = 2
    if rif:
        hoja.cell(row=posicion, column=1, value=f"RIF {rif}")
        hoja.cell(row=posicion, column=1).font = Font(size=9, color="64748B")
        posicion += 1
    hoja.cell(row=posicion, column=1, value=payload["titulo"])
    hoja.cell(row=posicion, column=1).font = Font(bold=True, size=12, color="1E293B")
    posicion += 1
    hoja.cell(
        row=posicion,
        column=1,
        value=(
            f"Generado: {_generado(payload)} · Moneda base: {moneda} · "
            f"Registros: {payload['total_filas']}"
        ),
    )
    hoja.cell(row=posicion, column=1).font = Font(size=9, color="64748B")
    posicion += 1
    hoja.cell(row=posicion, column=1, value=_linea_filtros(payload))
    hoja.cell(row=posicion, column=1).font = Font(size=9, color="64748B")
    posicion += 2

    fila_cabecera = posicion
    columnas = payload["columnas"]
    for indice, col in enumerate(columnas, start=1):
        celda = hoja.cell(row=fila_cabecera, column=indice, value=col["label"])
        celda.font = Font(bold=True, color="FFFFFF", size=9)
        celda.fill = PatternFill("solid", fgColor="1E293B")
        celda.alignment = Alignment(
            horizontal="right" if col.get("align") == "right" else "left",
            vertical="center",
        )

    formatos = {
        "money": "#,##0.00",
        "qty": "#,##0.000",
        "rate": "#,##0.000000",
        "percent": '0.00"%"',
        "int": "#,##0",
        "date": "dd/mm/yyyy",
        "datetime": "dd/mm/yyyy hh:mm",
    }
    bordes_finos = Border(bottom=Side(style="thin", color="E2E8F0"))
    anchos = {}

    fila_actual = fila_cabecera
    for fila in payload["filas"]:
        fila_actual += 1
        for indice, col in enumerate(columnas, start=1):
            tipo = col.get("type", "text")
            valor = _excel_valor(fila.get(col["key"]), tipo)
            celda = hoja.cell(row=fila_actual, column=indice, value=valor)
            celda.font = Font(size=9, color="0F172A")
            celda.border = bordes_finos
            if tipo in formatos:
                celda.number_format = formatos[tipo]
            if col.get("align") == "right":
                celda.alignment = Alignment(horizontal="right")
            anchos[indice] = max(
                anchos.get(indice, 0),
                _ancho_excel(col["label"]),
                _ancho_excel(valor),
            )

    totales = payload.get("fila_totales") or {}
    if totales:
        fila_actual += 1
        bordes_totales = Border(top=Side(style="medium", color="94A3B8"))
        for indice, col in enumerate(columnas, start=1):
            if indice == 1:
                valor = "TOTALES"
            else:
                tipo = col.get("type", "text")
                valor = _excel_valor(totales.get(col["key"]), tipo)
            celda = hoja.cell(row=fila_actual, column=indice, value=valor)
            celda.font = Font(bold=True, size=9, color="0F172A")
            celda.fill = PatternFill("solid", fgColor="E2E8F0")
            celda.border = bordes_totales
            if indice > 1 and col.get("type") in formatos:
                celda.number_format = formatos[col.get("type")]
            if col.get("align") == "right":
                celda.alignment = Alignment(horizontal="right")

    if anchos:
        for indice, ancho in anchos.items():
            hoja.column_dimensions[get_column_letter(indice)].width = min(max(ancho + 2, 10), 42)

    hoja.freeze_panes = hoja.cell(row=fila_cabecera + 1, column=1)
    if payload["filas"]:
        hoja.auto_filter.ref = (
            f"A{fila_cabecera}:"
            f"{get_column_letter(len(columnas))}{fila_cabecera + len(payload['filas'])}"
        )
    hoja.sheet_view.showGridLines = False

    buffer = BytesIO()
    libro.save(buffer)
    return buffer.getvalue()
