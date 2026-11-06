"""Generación de números de documento con control interno."""

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.common.models import Secuencia


@transaction.atomic
def siguiente_numero(nombre: str, prefijo: str, anio: int | None = None) -> str:
    """Incrementa la secuencia de forma atómica y devuelve el número formateado.

    Formato: `PREFIJO-YYYY-000001`.
    """
    anio = anio or timezone.localdate().year
    Secuencia.objects.get_or_create(nombre=nombre, anio=anio, defaults={"ultimo_valor": 0})
    Secuencia.objects.filter(nombre=nombre, anio=anio).update(ultimo_valor=F("ultimo_valor") + 1)
    ultimo_valor = (
        Secuencia.objects.filter(nombre=nombre, anio=anio)
        .values_list("ultimo_valor", flat=True)
        .get()
    )
    return f"{prefijo}-{anio}-{ultimo_valor:06d}"
