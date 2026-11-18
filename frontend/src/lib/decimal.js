/**
 * Aritmética decimal con `BigInt` para previsualizar montos en el navegador.
 *
 * Los resultados del backend siguen siendo la fuente de verdad. Estas funciones
 * existen para no usar `number` en operaciones monetarias.
 */
function parseDecimal(value) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) {
        return { digits: 0n, scale: 0 };
    }
    // Acepta coma o punto como separador decimal (formato VE y API).
    // Si hay ambos, el último se considera separador decimal.
    let normalized = trimmed;
    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");
    if (lastComma !== -1 || lastDot !== -1) {
        const decSep = lastComma > lastDot ? "," : ".";
        const thouSep = decSep === "," ? "." : ",";
        normalized = normalized.split(thouSep).join("");
        if (decSep === ",") {
            normalized = normalized.replace(",", ".");
        }
    }
    const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(normalized);
    if (!match) {
        return { digits: 0n, scale: 0 };
    }
    const sign = match[1] ? -1n : 1n;
    const fraction = match[3] ?? "";
    return {
        digits: sign * BigInt(`${match[2]}${fraction}`),
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
function formatParsed(value, decimalSeparator = ".") {
    const negative = value.digits < 0n;
    const absolute = negative ? -value.digits : value.digits;
    const padded = absolute.toString().padStart(value.scale + 1, "0");
    if (value.scale === 0) {
        return `${negative ? "-" : ""}${padded}`;
    }
    const integer = padded.slice(0, -value.scale);
    const fraction = padded.slice(-value.scale);
    return `${negative ? "-" : ""}${integer}${decimalSeparator}${fraction}`;
}

/** Convierte un decimal (punto o coma) al formato API con punto. */
export function toApiDecimal(value, decimalPlaces) {
    if (value === null || value === undefined || value === "") return "";
    const parsed = parseDecimal(value);
    const q = decimalPlaces != null ? quantize(parsed.digits, parsed.scale, decimalPlaces) : parsed;
    return formatParsed(q, ".");
}

/** Convierte un decimal con punto (API) a coma para mostrar en pantalla. */
export function toDisplayDecimal(value, decimalPlaces) {
    if (value === null || value === undefined || value === "") return "";
    const parsed = parseDecimal(value);
    const q = decimalPlaces != null ? quantize(parsed.digits, parsed.scale, decimalPlaces) : parsed;
    return formatParsed(q, ",");
}

/**
 * Formatea un número al estilo es-VE para inputs: separador de miles con punto
 * y coma decimal. Acepta tanto el formato API (punto decimal) como valores ya
 * escritos con coma. Conserva los decimales significativos y garantiza al menos
 * `minDecimals` decimales para que el valor nunca sea ambiguo (ej. 1500 -> 1.500,00).
 */
export function formatEsVeInput(value, minDecimals = 2) {
    if (value === null || value === undefined) return "";
    const raw = String(value).trim();
    if (!raw || !/^[\d.,]+$/.test(raw)) return "";
    const api = toApiDecimal(raw);
    if (!api) return "";
    const [integerRaw, fractionRaw = ""] = api.split(".");
    const trimmedFraction = fractionRaw.replace(/0+$/, "");
    const fraction = trimmedFraction.length >= minDecimals
        ? trimmedFraction
        : (trimmedFraction || "0").padEnd(minDecimals, "0");
    const integer = integerRaw.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${integer},${fraction}`;
}

/**
 * Formatea un decimal para inputs usando separador de miles (.) y coma decimal,
 * estilo es-VE. Ej.: "1234.5" -> "1.234,50" (con 2 decimales).
 */
export function formatInputDecimal(value, decimalPlaces = 2) {
    if (value === null || value === undefined || value === "") return "";
    const parsed = parseDecimal(value);
    const q = decimalPlaces != null ? quantize(parsed.digits, parsed.scale, decimalPlaces) : parsed;
    const negative = q.digits < 0n;
    const absolute = negative ? -q.digits : q.digits;
    const padded = absolute.toString().padStart(q.scale + 1, "0");
    const integerRaw = q.scale === 0 ? padded : padded.slice(0, -q.scale);
    const fraction = q.scale === 0 ? "" : padded.slice(-q.scale);
    const integer = integerRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    if (q.scale === 0) return `${negative ? "-" : ""}${integer}`;
    return `${negative ? "-" : ""}${integer},${fraction}`;
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
