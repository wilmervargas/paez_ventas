/**
 * Aritmética decimal con `BigInt` para previsualizar montos en el navegador.
 *
 * Los resultados del backend siguen siendo la fuente de verdad. Estas funciones
 * existen para no usar `number` en operaciones monetarias.
 */
function parseDecimal(value) {
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
function pow10(exponent) {
    return 10n ** BigInt(exponent);
}
function quantize(digits, scale, decimalPlaces) {
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
function formatParsed(value) {
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
export function addDecimals(values, decimalPlaces = 2) {
    const parsed = values.map(parseDecimal);
    const maxScale = parsed.reduce((max, item) => Math.max(max, item.scale), decimalPlaces);
    const total = parsed.reduce((sum, item) => sum + item.digits * pow10(maxScale - item.scale), 0n);
    return formatParsed(quantize(total, maxScale, decimalPlaces));
}
/** Multiplica dos decimales y redondea a `decimalPlaces`. */
export function multiplyDecimals(left, right, decimalPlaces = 2) {
    const a = parseDecimal(left);
    const b = parseDecimal(right);
    return formatParsed(quantize(a.digits * b.digits, a.scale + b.scale, decimalPlaces));
}
/** Calcula `value * percent / 100` con redondeo half-up. */
export function percentOf(value, percent, decimalPlaces = 2) {
    const a = parseDecimal(value);
    const b = parseDecimal(percent);
    return formatParsed(quantize(a.digits * b.digits, a.scale + b.scale + 2, decimalPlaces));
}

/** Resta `right` de `left` y redondea a `decimalPlaces`. */
export function subtractDecimals(left, right, decimalPlaces = 2) {
    const a = parseDecimal(left);
    const b = parseDecimal(right);
    const maxScale = Math.max(a.scale, b.scale, decimalPlaces);
    const diff = a.digits * pow10(maxScale - a.scale) - b.digits * pow10(maxScale - b.scale);
    return formatParsed(quantize(diff, maxScale, decimalPlaces));
}
/**
 * Divide dos decimales y redondea half-up.
 *
 * Se usa para previsualizar equivalencias (ej. total en moneda base a partir de
 * la tasa congelada) sin recurrir a `number`.
 */
export function divideDecimals(left, right, decimalPlaces = 2) {
    const a = parseDecimal(left);
    const b = parseDecimal(right);
    if (b.digits === 0n) {
        return formatParsed({ digits: 0n, scale: decimalPlaces });
    }
    const numerator = a.digits * pow10(b.scale + decimalPlaces);
    const denominator = b.digits * pow10(a.scale);
    const quotient = numerator / denominator;
    const remainder = numerator % denominator;
    const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
    return formatParsed({ digits: rounded, scale: decimalPlaces });
}
