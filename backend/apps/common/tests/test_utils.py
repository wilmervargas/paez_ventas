"""Tests de utilidades comunes."""

import pytest

from apps.common.utils.money import money, to_base, to_decimal
from apps.common.utils.phone import normalize_phone


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        ("0414-1234567", "+584141234567"),
        ("584141234567", "+584141234567"),
        ("+58 414 1234567", "+584141234567"),
        ("4141234567", "+584141234567"),
        ("", ""),
        ("123", ""),
    ],
)
def test_normalize_phone(entrada, esperado):
    assert normalize_phone(entrada) == esperado


def test_money_redondea_half_up():
    assert str(money("10.005")) == "10.01"
    assert str(money(2)) == "2.00"


def test_to_base_convierte_con_tasa():
    assert str(to_base("100.00", "40.000000")) == "2.50"


def test_to_decimal_evita_float():
    assert str(to_decimal("0.1")) == "0.1"
    with pytest.raises(ValueError):
        to_decimal("no-es-numero")
