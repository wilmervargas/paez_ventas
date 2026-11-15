"""Normalización de teléfonos a formato internacional sin el signo '+'."""

import re

COUNTRY_CODES = {
    "VE": "58",
}


def normalize_phone(value: str, default_country: str = "VE") -> str:
    """Devuelve el teléfono internacional solo con dígitos (sin '+').

    Ejemplos (VE): 0414-1234567  -> 584141234567
                   584141234567  -> 584141234567
                   +58 414 1234567 -> 584141234567

    El signo '+' se acepta como entrada, pero nunca se devuelve: los datos
    guardados, mostrados y enviados usan solo dígitos.
    """
    if not value:
        return ""

    digits = re.sub(r"\D", "", str(value))
    if not digits:
        return ""

    if digits.startswith("00"):
        digits = digits[2:]

    country_code = COUNTRY_CODES.get(default_country.upper())
    if country_code:
        if digits.startswith(country_code):
            national = digits[len(country_code) :]
        elif digits.startswith("0"):
            national = digits[1:]
        else:
            national = digits
        # Venezuela: 10 dígitos nacionales (3 de operadora + 7).
        if len(national) != 10:
            return ""
        return f"{country_code}{national}"

    return digits


def phone_digits(value: str) -> str:
    """Devuelve solo los dígitos del teléfono (para enlaces y APIs)."""
    return re.sub(r"\D", "", str(value or ""))


def is_valid_phone(value: str, default_country: str = "VE") -> bool:
    return bool(normalize_phone(value, default_country))
