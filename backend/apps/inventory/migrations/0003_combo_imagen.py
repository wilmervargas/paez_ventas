# Generated manually: agrega imagen opcional a combos.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0002_movimientoinventario_costo_unitario_base_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="combo",
            name="imagen",
            field=models.ImageField(blank=True, upload_to="combos/", verbose_name="imagen"),
        ),
    ]
