from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0005_pedido_plan_cuotas"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="pedido",
            name="pedido_numero_cuotas_rango",
        ),
        migrations.AddConstraint(
            model_name="pedido",
            constraint=models.CheckConstraint(
                condition=models.Q(numero_cuotas__gte=1) & models.Q(numero_cuotas__lte=10),
                name="pedido_numero_cuotas_rango",
            ),
        ),
    ]
