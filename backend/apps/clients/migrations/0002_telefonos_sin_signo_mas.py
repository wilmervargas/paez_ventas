"""Quita el signo '+' de los teléfonos de clientes y proveedores ya guardados."""

import re

from django.db import migrations


def _sin_signo_mas(valor):
    """Deja el teléfono sin '+' conservando el resto de los dígitos."""
    limpio = re.sub(r"[\s\-()]+", "", str(valor or ""))
    return limpio.lstrip("+")


def forwards(apps, schema_editor):
    Cliente = apps.get_model("clients", "Cliente")
    Proveedor = apps.get_model("clients", "Proveedor")

    for cliente in Cliente.objects.all():
        cambios = []
        for campo in ("telefono", "telefono_alt"):
            actual = getattr(cliente, campo)
            nuevo = _sin_signo_mas(actual)
            if nuevo != actual:
                setattr(cliente, campo, nuevo)
                cambios.append(campo)
        if cambios:
            cliente.save(update_fields=cambios)

    for proveedor in Proveedor.objects.all():
        nuevo = _sin_signo_mas(proveedor.telefono)
        if nuevo != proveedor.telefono:
            proveedor.telefono = nuevo
            proveedor.save(update_fields=["telefono"])


class Migration(migrations.Migration):

    dependencies = [
        ("clients", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]