import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("finances", "0005_telefono_origen_sin_signo_mas"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="cuota",
            name="cuota_numero_1_8",
        ),
        migrations.AlterField(
            model_name="cuota",
            name="numero",
            field=models.PositiveSmallIntegerField(
                validators=[
                    django.core.validators.MinValueValidator(1),
                    django.core.validators.MaxValueValidator(10),
                ],
                verbose_name="número de cuota",
            ),
        ),
        migrations.AddConstraint(
            model_name="cuota",
            constraint=models.CheckConstraint(
                condition=models.Q(("numero__gte", 1), ("numero__lte", 10)),
                name="cuota_numero_1_8",
            ),
        ),
    ]
