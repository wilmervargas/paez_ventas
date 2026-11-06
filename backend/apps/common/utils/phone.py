"""Normalización de teléfonos a formato E.164."""

import re

COUNTRY_CODES = {
    "VE": "58",
}


def normalize_phone(value: str, default_country: str = "VE") -> str:
    """Devuelve el teléfono en formato E.164 o cadena vacía si no es válido.

    Ejemplos (VE): 0414-1234567 -> +584141234567
                   584141234567 -> +584141234567
                   +58 414 1234567 -> +584141234567
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
        return f"+{country_code}{national}"

    if not digits.startswith("+"):
        return ""
    return f"+{digits}"


def is_valid_phone(value: str, default_country: str = "VE") -> bool:
    return bool(normalize_phone(value, default_country))
