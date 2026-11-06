import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import { getErrorMessage } from "./errors";

function validationError(data: unknown): AxiosError {
  return new AxiosError(
    "Request failed with status code 400",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      data,
      status: 400,
      statusText: "Bad Request",
      headers: {},
      config: { headers: new AxiosHeaders() },
    },
  );
}

describe("getErrorMessage", () => {
  it("muestra el error concreto cuando el backend devuelve un mensaje genérico", () => {
    const error = validationError({
      detail: "Error de validación.",
      code: "invalid",
      errors: {
        logo: ["La información enviada no era un archivo."],
      },
    });

    expect(getErrorMessage(error)).toBe("logo: La información enviada no era un archivo.");
  });

  it("prefiere el detalle legible del backend", () => {
    const error = validationError({
      detail: "No hay caja abierta.",
      code: "caja_cerrada",
      errors: {},
    });

    expect(getErrorMessage(error)).toBe("No hay caja abierta.");
  });

  it("lee errores generales del formulario", () => {
    const error = validationError({
      detail: "Error de validación.",
      code: "invalid",
      errors: {
        non_field_errors: ["El pago supera el saldo de la deuda."],
      },
    });

    expect(getErrorMessage(error)).toBe("El pago supera el saldo de la deuda.");
  });

  it("usa el mensaje de respaldo si el error no es de la API", () => {
    expect(getErrorMessage(new Error(""), "Fallback")).toBe("Fallback");
  });
});
