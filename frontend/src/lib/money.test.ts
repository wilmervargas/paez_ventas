import { describe, expect, it } from "vitest";

import { formatMoney } from "./money";

describe("formatMoney", () => {
  it("formatea montos en formato es-VE", () => {
    expect(formatMoney("1234.5", "USD")).toContain("1.234,50");
  });

  it("devuelve un guion para valores inválidos", () => {
    expect(formatMoney("no-es-numero")).toBe("—");
  });
});
