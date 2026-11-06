import { describe, expect, it } from "vitest";

import { addDecimals, multiplyDecimals, percentOf } from "./decimal";

describe("decimal", () => {
  it("suma sin errores de punto flotante", () => {
    expect(addDecimals(["0.10", "0.20"])).toBe("0.30");
    expect(addDecimals(["125.00", "20.00", "0.005"])).toBe("145.01");
  });

  it("multiplica y redondea half-up", () => {
    expect(multiplyDecimals("10.000", "12.5000")).toBe("125.00");
    expect(multiplyDecimals("1.005", "1")).toBe("1.01");
  });

  it("calcula porcentajes con precisión decimal", () => {
    expect(percentOf("125.00", "16.00")).toBe("20.00");
    expect(percentOf("10.00", "16.00")).toBe("1.60");
  });
});
