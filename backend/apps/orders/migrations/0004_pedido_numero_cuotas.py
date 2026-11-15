# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0003_pedido_numero_referencia_pedido_otros_montos_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="pedido",
            name="numero_cuotas",
            field=models.PositiveSmallIntegerField(default=1, verbose_name="número de cuotas"),
        ),
        migrations.AddConstraint(
            model_name="pedido",
            constraint=models.CheckConstraint(
                condition=models.Q(("numero_cuotas__gte", 1), ("numero_cuotas__lte", 8)),
                name="pedido_numero_cuotas_rango",
            ),
        ),
    ]
