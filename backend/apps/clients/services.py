"""Servicios del dominio clientes."""

import re

from django.db import transaction

from .models import Cliente, Proveedor


def _next_codigo(model, prefix: str, ancho: int = 5) -> str:
    """Genera el siguiente código secuencial para el modelo indicado."""
    patron = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    ultimo = model.objects.filter(codigo__startswith=f"{prefix}-").order_by("-codigo").first()
    consecutivo = 0
    if ultimo is not None:
        match = patron.match(ultimo.codigo)
        if match:
            consecutivo = int(match.group(1))
    return f"{prefix}-{consecutivo + 1:0{ancho}d}"


@transaction.atomic
def crear_cliente(data: dict, user=None) -> Cliente:
    data = dict(data)
    if not data.get("codigo"):
        data["codigo"] = _next_codigo(Cliente, "CL")
    cliente = Cliente(**data, created_by=user if user and user.is_authenticated else None)
    cliente.full_clean()
    cliente.save()
    return cliente


@transaction.atomic
def crear_proveedor(data: dict, user=None) -> Proveedor:
    data = dict(data)
    if not data.get("codigo"):
        data["codigo"] = _next_codigo(Proveedor, "PR")
    proveedor = Proveedor(**data, created_by=user if user and user.is_authenticated else None)
    proveedor.full_clean()
    proveedor.save()
    return proveedor
