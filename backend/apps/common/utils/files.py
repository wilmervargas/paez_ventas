"""Utilidades para archivos gestionados por FileField."""

import logging

logger = logging.getLogger(__name__)


def delete_replaced_file(previo, actual) -> bool:
    """Borra del storage el archivo previo de un FileField cuando quedó huérfano.

    Se llama después de guardar el modelo. Si el campo quedó vacío (borrado
    explícito con `""`) o el archivo cambió de nombre (reemplazo), el archivo
    anterior ya no tiene dueño y se elimina. Devuelve True si borró algo.
    """
    if previo is None or actual is None:
        return False
    nombre_previo = getattr(previo, "name", "") or ""
    if not nombre_previo:
        return False
    nombre_actual = getattr(actual, "name", "") or ""
    if nombre_actual == nombre_previo:
        return False
    previo.storage.delete(nombre_previo)
    logger.info("Archivos: eliminado del storage %s", nombre_previo)
    return True
