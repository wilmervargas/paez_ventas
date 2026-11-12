import { describe, expect, it } from "vitest";
import { formatQuantity } from "./numbers";
describe("formatQuantity", () => {
    it("formatea cantidades con hasta 3 decimales", () => {
        expect(formatQuantity("5.000")).toBe("5");
        expect(formatQuantity("1234.5")).toBe("1.234,5");
    });
    it("devuelve un guion para valores inválidos", () => {
        expect(formatQuantity("no-es-numero")).toBe("—");
    });
});
