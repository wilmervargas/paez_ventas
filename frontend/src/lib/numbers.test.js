import { describe, expect, it } from "vitest";
import { formatQuantity } from "./numbers";
describe("formatQuantity", () => {
    it("formatea cantidades siempre con 2 decimales", () => {
        expect(formatQuantity("5.000")).toBe("5,00");
        expect(formatQuantity("1234.5")).toBe("1.234,50");
    });
    it("devuelve un guion para valores inválidos", () => {
        expect(formatQuantity("no-es-numero")).toBe("—");
    });
});
