import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportFilters } from "./ReportFilters";

const REPORTE = {
  filtros: [
    { key: "desde", label: "Desde", type: "date" },
    {
      key: "estado",
      label: "Estado",
      type: "select",
      placeholder: "Todos",
      options: [
        { value: "pendiente", label: "Pendiente" },
        { value: "pagada", label: "Pagada" },
      ],
    },
    { key: "solo_vencidas", label: "Solo vencidas", type: "checkbox" },
  ],
};

describe("ReportFilters", () => {
  it("envía el borrador con los filtros elegidos", () => {
    const onApply = vi.fn();
    render(
      <ReportFilters
        reporte={REPORTE}
        opciones={{}}
        onApply={onApply}
        onReset={() => {}}
        cargando={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "pagada" } });
    fireEvent.click(screen.getByLabelText("Solo vencidas"));
    fireEvent.click(screen.getByRole("button", { name: /Aplicar filtros/ }));

    expect(onApply).toHaveBeenCalledWith({
      desde: "2026-11-01",
      estado: "pagada",
      solo_vencidas: true,
    });
  });

  it("limpia el borrador y avisa al padre", () => {
    const onReset = vi.fn();
    render(
      <ReportFilters
        reporte={REPORTE}
        opciones={{}}
        onApply={() => {}}
        onReset={onReset}
        cargando={false}
      />,
    );

    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "pagada" } });
    fireEvent.click(screen.getByRole("button", { name: /Limpiar/ }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Estado")).toHaveValue("");
    expect(screen.getByLabelText("Solo vencidas")).not.toBeChecked();
  });
});
