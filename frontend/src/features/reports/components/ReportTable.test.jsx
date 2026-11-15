import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formatCelda } from "../format";
import { ReportTable } from "./ReportTable";

const REPORTE = {
  titulo: "Reporte demo",
  moneda_base: "USD",
  columnas: [
    { key: "cliente", label: "Cliente", type: "text" },
    { key: "estado", label: "Estado", type: "badge" },
    { key: "fecha", label: "Fecha", type: "date" },
    { key: "total_base", label: "Total base", type: "money", currency: "base", align: "right" },
  ],
  filas: [
    {
      cliente: "Cliente de Prueba",
      estado: "Pagada",
      fecha: "2026-11-14",
      moneda: "USD",
      total_base: "1234.56",
    },
  ],
  fila_totales: { total_base: "1234.56" },
};

describe("formatCelda", () => {
  it("formatea montos en la moneda indicada", () => {
    const texto = formatCelda("1234.56", { type: "money", currency: "base" }, {}, "USD");
    expect(texto).toContain("1.234,56");
  });

  it("formatea fechas ISO sin desfase de zona horaria", () => {
    expect(formatCelda("2026-11-14", { type: "date" }, {}, "USD")).toBe("14/11/2026");
  });

  it("formatea cantidades y porcentajes", () => {
    expect(formatCelda("12.500", { type: "qty" }, {}, "USD")).toBe("12,50");
    expect(formatCelda("37.25", { type: "percent" }, {}, "USD")).toBe("37,25 %");
  });
});

describe("ReportTable", () => {
  it("muestra filas, badges y la fila de totales", () => {
    render(<ReportTable reporte={REPORTE} />);

    expect(screen.getByText("Cliente de Prueba")).toBeInTheDocument();
    expect(screen.getByText("Pagada")).toBeInTheDocument();
    expect(screen.getByText("14/11/2026")).toBeInTheDocument();
    expect(screen.getByText("Totales")).toBeInTheDocument();
    expect(screen.getAllByText(/1\.234,56/).length).toBeGreaterThan(0);
  });

  it("permite paginar recibiendo solo las filas visibles", () => {
    render(<ReportTable reporte={REPORTE} filas={[]} />);

    expect(screen.queryByText("Cliente de Prueba")).not.toBeInTheDocument();
    expect(screen.getByText("Totales")).toBeInTheDocument();
  });
});
