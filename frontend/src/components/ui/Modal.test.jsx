import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";
function abrirModal(onClose) {
    render(<Modal open onClose={onClose} title="Editar producto">
      <form>
        <input aria-label="Nombre del producto"/>
      </form>
    </Modal>);
    const backdrop = screen.getByRole("dialog").parentElement;
    const campo = screen.getByLabelText("Nombre del producto");
    return { backdrop, campo };
}
describe("Modal", () => {
    it("cierra con un clic que empieza y termina en el fondo", () => {
        const onClose = vi.fn();
        const { backdrop } = abrirModal(onClose);
        fireEvent.mouseDown(backdrop, { target: backdrop });
        fireEvent.mouseUp(backdrop, { target: backdrop });
        fireEvent.click(backdrop, { target: backdrop });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
    it("no cierra cuando se arrastra desde un campo hacia el fondo", () => {
        const onClose = vi.fn();
        const { backdrop, campo } = abrirModal(onClose);
        // Selección de texto: mousedown dentro del diálogo, mouseup en el fondo.
        fireEvent.mouseDown(campo);
        fireEvent.mouseUp(backdrop, { target: backdrop });
        fireEvent.click(backdrop, { target: backdrop });
        expect(onClose).not.toHaveBeenCalled();
    });
    it("no cierra con clics dentro del diálogo", () => {
        const onClose = vi.fn();
        const { campo } = abrirModal(onClose);
        fireEvent.mouseDown(campo);
        fireEvent.click(campo);
        expect(onClose).not.toHaveBeenCalled();
    });
    it("cierra con la tecla Escape", () => {
        const onClose = vi.fn();
        abrirModal(onClose);
        fireEvent.keyDown(document, { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
