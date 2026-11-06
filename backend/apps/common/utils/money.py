"""Utilidades de dinero.

Regla del proyecto: nunca usar float para montos.
"""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

TWO_PLACES = Decimal("0.01")


def to_decimal(value) -> Decimal:
    """Convierte un valor a Decimal de forma segura (sin pasar por float)."""
    if isinstance(value, Decimal):
        return value
    if value is None or value == "":
        return Decimal("0")
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"Valor monetario inválido: {value!r}") from exc


def money(value) -> Decimal:
    """Redondea a 2 decimales con ROUND_HALF_UP."""
    return to_decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def to_base(amount, tasa_cambio) -> Decimal:
    """Convierte un monto de una moneda a la moneda base usando la tasa dada."""
    return money(to_decimal(amount) / to_decimal(tasa_cambio))


def from_base(amount_base, tasa_cambio) -> Decimal:
    """Convierte un monto de la moneda base a otra moneda usando la tasa dada."""
    return money(to_decimal(amount_base) * to_decimal(tasa_cambio))
