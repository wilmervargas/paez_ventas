import { describe, expect, it } from "vitest";
import { formatMoney, formatRate } from "./money";
describe("formatMoney", () => {
    it("formatea montos en formato es-VE", () => {
        expect(formatMoney("1234.5", "USD")).toContain("1.234,50");
    });
    it("devuelve un guion para valores inválidos", () => {
        expect(formatMoney("no-es-numero")).toBe("—");
    });
});
describe("formatRate", () => {
    it("formatea una tasa en bolívares", () => {
        expect(formatRate("40.5")).toBe("Bs 40,50");
    });
    it("conserva hasta 4 decimales", () => {
        expect(formatRate("0.909091")).toBe("Bs 0,9091");
    });
    it("devuelve un guion cuando no hay tasa", () => {
        expect(formatRate(null)).toBe("—");
        expect(formatRate(undefined)).toBe("—");
        expect(formatRate("")).toBe("—");
    });
    it("usa el código de la moneda si no hay símbolo conocido", () => {
        expect(formatRate("42.25", "USDT")).toBe("USDT 42,25");
    });
});
