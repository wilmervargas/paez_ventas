"""Campos de serializer reutilizables."""

from django.core.files.uploadedfile import UploadedFile
from rest_framework import serializers
from rest_framework.fields import SkipField

MAX_IMAGEN_BYTES = 2 * 1024 * 1024
TIPOS_IMAGEN = {"image/jpeg", "image/png", "image/webp"}


class ImagenOpcionalField(serializers.ImageField):
    """Imagen opcional que acepta `""` como solicitud de borrado.

    El `ImageField` estándar de DRF rechaza cadenas vacías y, en formularios
    HTML, traduce `""` a `None` cuando `allow_null=True`. Con este campo el
    cliente puede enviar `imagen: ""` para eliminar la imagen guardada sin
    pasar por `null` (el campo del modelo no admite NULL, solo vacío).
    """

    def get_value(self, dictionary):
        if self.field_name in dictionary and dictionary[self.field_name] == "":
            # DRF convertiría "" en None al leer formularios HTML; aquí ""
            # significa "borrar la imagen" y debe llegar al servicio tal cual.
            return ""
        return super().get_value(dictionary)

    def to_internal_value(self, data):
        if data == "":
            return ""

        if isinstance(data, UploadedFile) and not data.name:
            # Un <input type="file"> vacío llega como archivo sin nombre:
            # se interpreta como "no se envió imagen", no como error.
            raise SkipField()

        archivo = super().to_internal_value(data)

        content_type = getattr(archivo, "content_type", "")
        if content_type not in TIPOS_IMAGEN:
            raise serializers.ValidationError("La imagen debe ser PNG, JPG o WEBP.")
        if archivo.size > MAX_IMAGEN_BYTES:
            raise serializers.ValidationError("La imagen no puede superar los 2 MB.")
        return archivo
