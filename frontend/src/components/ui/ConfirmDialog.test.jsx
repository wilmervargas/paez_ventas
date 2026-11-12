import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";
describe("ConfirmDialog", () => {
    it("muestra el mensaje y ejecuta la acción al confirmar", () => {
        const onConfirm = vi.fn();
        const onClose = vi.fn();
        render(<ConfirmDialog open title="Eliminar producto" message="Se eliminará de forma permanente." onConfirm={onConfirm} onClose={onClose}/>);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("Se eliminará de forma permanente.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
    it("cancela sin ejecutar la acción", () => {
        const onConfirm = vi.fn();
        const onClose = vi.fn();
        render(<ConfirmDialog open title="Eliminar producto" message="Se eliminará de forma permanente." onConfirm={onConfirm} onClose={onClose}/>);
        fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
        expect(onConfirm).not.toHaveBeenCalled();
    });
    it("no renderiza nada cuando está cerrado", () => {
        render(<ConfirmDialog open={false} title="Eliminar producto" message="whatever" onConfirm={() => { }} onClose={() => { }}/>);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    it("muestra el error de la mutación", () => {
        render(<ConfirmDialog open title="Eliminar producto" message="Se eliminará de forma permanente." error="El producto tiene movimientos de inventario." onConfirm={() => { }} onClose={() => { }}/>);
        expect(screen.getByText("El producto tiene movimientos de inventario.")).toBeInTheDocument();
    });
});
