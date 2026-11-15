"""Quita el signo '+' del teléfono de la empresa."""

import re

from django.db import migrations


def _sin_signo_mas(valor):
    """Deja el teléfono sin '+' conservando el resto de los dígitos."""
    limpio = re.sub(r"[\s\-()]+", "", str(valor or ""))
    return limpio.lstrip("+")


def forwards(apps, schema_editor):
    Empresa = apps.get_model("company", "Empresa")

    for empresa in Empresa.objects.exclude(telefono="").exclude(telefono__isnull=True):
        nuevo = _sin_signo_mas(empresa.telefono)
        if nuevo != empresa.telefono:
            empresa.telefono = nuevo
            empresa.save(update_fields=["telefono"])


class Migration(migrations.Migration):

    dependencies = [
        ("company", "0002_tasas_por_par"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]