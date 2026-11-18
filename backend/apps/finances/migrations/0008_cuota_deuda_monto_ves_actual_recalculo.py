"""Campos para equivalente VES actualizado por recalculo de tasas (cobranza)."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("finances", "0007_deuda_saldo_base_deuda_saldo_bs_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="cuota",
            name="monto_ves_actual",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Equivalente en bolívares recalculado con la tasa vigente del día (solo cobranza).",
                max_digits=14,
                null=True,
                verbose_name="monto en VES (actualizado)",
            ),
        ),
        migrations.AddField(
            model_name="cuota",
            name="tasa_recalculo",
            field=models.DecimalField(
                blank=True,
                decimal_places=6,
                max_digits=18,
                null=True,
                verbose_name="tasa usada en recálculo",
            ),
        ),
        migrations.AddField(
            model_name="cuota",
            name="tasa_tipo_recalculo",
            field=models.CharField(
                blank=True,
                max_length=20,
                null=True,
                verbose_name="tipo de tasa del recálculo",
            ),
        ),
        migrations.AddField(
            model_name="cuota",
            name="fecha_recalculo_tasa",
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name="fecha de recálculo de tasa",
            ),
        ),
        migrations.AddField(
            model_name="deuda",
            name="saldo_ves_actual",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Suma de equivalentes VES actualizados de cuotas pendientes/parciales.",
                max_digits=14,
                null=True,
                verbose_name="saldo en VES (actualizado)",
            ),
        ),
        migrations.AddField(
            model_name="deuda",
            name="fecha_recalculo_tasa",
            field=models.DateTimeField(
                blank=True,
                null=True,
                verbose_name="fecha de recálculo de tasa",
            ),
        ),
    ]
