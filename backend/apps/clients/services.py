"""Servicios del dominio clientes."""

import logging
import re

from django.db import transaction
from django.db.models import ProtectedError

from apps.common.exceptions import RecursoVinculadoError

from .models import Cliente, Proveedor

logger = logging.getLogger("auditoria")


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


def _eliminar_o_vinculado(instance, descripcion: str) -> None:
    """Elimina el registro o traduce un `ProtectedError` a 409 legible."""
    try:
        with transaction.atomic():
            instance.delete()
    except ProtectedError as exc:
        raise RecursoVinculadoError(
            f"No se pudo eliminar {descripcion}: tiene registros asociados."
        ) from exc


def eliminar_cliente(cliente: Cliente) -> None:
    """Elimina físicamente el cliente si no tiene pedidos ni deudas vinculados."""
    if cliente.pedidos.exists():
        raise RecursoVinculadoError(
            "El cliente tiene pedidos asociados. Anúlelos o elimínelos primero."
        )
    try:
        from apps.finances.models import Deuda

        if Deuda.objects.filter(cliente=cliente).exists():
            raise RecursoVinculadoError(
                "El cliente tiene deudas asociadas. Anúlelas o págelas primero."
            )
    except ImportError:
        pass
    nombre = cliente.nombre
    codigo = cliente.codigo
    _eliminar_o_vinculado(cliente, "el cliente")
    logger.info("Clientes: cliente %s (%s) eliminado", codigo, nombre)


def eliminar_proveedor(proveedor: Proveedor) -> None:
    """Elimina físicamente el proveedor si no tiene compras vinculadas."""
    from apps.purchases.models import Compra

    if Compra.objects.filter(proveedor=proveedor).exists():
        raise RecursoVinculadoError("El proveedor tiene compras asociadas. Anúlelas primero.")
    nombre = proveedor.nombre
    codigo = proveedor.codigo
    _eliminar_o_vinculado(proveedor, "el proveedor")
    logger.info("Clientes: proveedor %s (%s) eliminado", codigo, nombre)
