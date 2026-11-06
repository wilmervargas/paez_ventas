/**
 * Aritmética decimal con `BigInt` para previsualizar montos en el navegador.
 *
 * Los resultados del backend siguen siendo la fuente de verdad. Estas funciones
 * existen para no usar `number` en operaciones monetarias.
 */

interface ParsedDecimal {
  digits: bigint;
  scale: number;
}

function parseDecimal(value: string): ParsedDecimal {
  const trimmed = (value ?? "").trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    return { digits: 0n, scale: 0 };
  }
  const fraction = match[2] ?? "";
  return {
    digits: BigInt(`${match[1]}${fraction}`),
    scale: fraction.length,
  };
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function quantize(digits: bigint, scale: number, decimalPlaces: number): ParsedDecimal {
  if (scale <= decimalPlaces) {
    return {
      digits: digits * pow10(decimalPlaces - scale),
      scale: decimalPlaces,
    };
  }

  const divisor = pow10(scale - decimalPlaces);
  const quotient = digits / divisor;
  const remainder = digits % divisor;
  const rounded = remainder * 2n >= divisor ? quotient + 1n : quotient;
  return { digits: rounded, scale: decimalPlaces };
}

function formatParsed(value: ParsedDecimal): string {
  const negative = value.digits < 0n;
  const absolute = negative ? -value.digits : value.digits;
  const padded = absolute.toString().padStart(value.scale + 1, "0");
  if (value.scale === 0) {
    return `${negative ? "-" : ""}${padded}`;
  }
  const integer = padded.slice(0, -value.scale);
  const fraction = padded.slice(-value.scale);
  return `${negative ? "-" : ""}${integer}.${fraction}`;
}

/** Suma montos expresados como string y redondea a `decimalPlaces`. */
export function addDecimals(values: string[], decimalPlaces = 2): string {
  const parsed = values.map(parseDecimal);
  const maxScale = parsed.reduce((max, item) => Math.max(max, item.scale), decimalPlaces);
  const total = parsed.reduce(
    (sum, item) => sum + item.digits * pow10(maxScale - item.scale),
    0n,
  );
  return formatParsed(quantize(total, maxScale, decimalPlaces));
}

/** Multiplica dos decimales y redondea a `decimalPlaces`. */
export function multiplyDecimals(
  left: string,
  right: string,
  decimalPlaces = 2,
): string {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  return formatParsed(quantize(a.digits * b.digits, a.scale + b.scale, decimalPlaces));
}

/** Calcula `value * percent / 100` con redondeo half-up. */
export function percentOf(value: string, percent: string, decimalPlaces = 2): string {
  const a = parseDecimal(value);
  const b = parseDecimal(percent);
  return formatParsed(
    quantize(a.digits * b.digits, a.scale + b.scale + 2, decimalPlaces),
  );
}
