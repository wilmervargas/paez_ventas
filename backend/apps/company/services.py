"""Servicios del dominio empresa."""

from django.db import transaction

from .models import Empresa, TasaCambio


def get_empresa() -> Empresa | None:
    return Empresa.get_solo()


@transaction.atomic
def upsert_empresa(data: dict, user=None) -> Empresa:
    """Crea o actualiza la empresa singleton."""
    empresa = Empresa.get_solo()
    if empresa is None:
        empresa = Empresa(**data)
        if user is not None and user.is_authenticated:
            empresa.created_by = user
    else:
        for field, value in data.items():
            setattr(empresa, field, value)
    empresa.save()
    return empresa


def get_tasa_vigente(moneda: str = "VES") -> TasaCambio | None:
    """Devuelve la última tasa registrada para la moneda."""
    return TasaCambio.objects.filter(moneda=moneda.upper()).order_by("-vigente_desde").first()
