"""Formato uniforme de errores de la API."""

from rest_framework.exceptions import APIException, ValidationError
from rest_framework.views import exception_handler


class BusinessRuleError(APIException):
    """Error de negocio que debe devolverse como 400 con mensaje legible."""

    status_code = 400
    default_detail = "La operación no cumple una regla de negocio."
    default_code = "business_rule"


def api_exception_handler(exc, context):
    """Envuelve los errores en `{detail, code, errors}`."""
    response = exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(response.data, dict):
        errors = response.data
    else:
        errors = {"non_field_errors": response.data}

    detail = errors.get("detail")
    if detail is None:
        detail = "Error de validación." if isinstance(exc, ValidationError) else "Error."

    response.data = {
        "detail": str(detail),
        "code": getattr(exc, "default_code", "error"),
        "errors": errors,
    }
    return response
