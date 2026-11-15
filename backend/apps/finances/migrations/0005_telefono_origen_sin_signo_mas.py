"""Quita el signo '+' del teléfono de origen de los pagos ya guardados."""

import re

from django.db import migrations


def _sin_signo_mas(valor):
    """Deja el teléfono sin '+' conservando el resto de los dígitos."""
    limpio = re.sub(r"[\s\-()]+", "", str(valor or ""))
    return limpio.lstrip("+")


def forwards(apps, schema_editor):
    Pago = apps.get_model("finances", "Pago")

    for pago in Pago.objects.exclude(telefono_origen="").exclude(telefono_origen__isnull=True):
        nuevo = _sin_signo_mas(pago.telefono_origen)
        if nuevo != pago.telefono_origen:
            pago.telefono_origen = nuevo
            pago.save(update_fields=["telefono_origen"])


class Migration(migrations.Migration):

    dependencies = [
        ("finances", "0004_cajasesion_cuota_movimientocaja_pago_pagoaplicacion_and_more"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]