import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImageInput } from "./ImageInput";
function renderInput(props = {}) {
    const onFileChange = vi.fn();
    const onRemoveChange = vi.fn();
    render(<ImageInput currentUrl="http://localhost/media/productos/cafe.png" file={null} remove={false} onFileChange={onFileChange} onRemoveChange={onRemoveChange} label="Imagen del producto" {...props}/>);
    return { onFileChange, onRemoveChange };
}
describe("ImageInput", () => {
    it("muestra la imagen actual del servidor", () => {
        renderInput();
        const imagen = screen.getByAltText("Imagen del producto");
        expect(imagen).toHaveAttribute("src", "http://localhost/media/productos/cafe.png");
    });
    it("muestra el hueco vacío cuando no hay imagen", () => {
        renderInput({ currentUrl: null });
        expect(screen.queryByRole("img")).not.toBeInTheDocument();
        expect(screen.queryByAltText("Imagen del producto")).not.toBeInTheDocument();
    });
    it("quitar limpia el archivo y pide el borrado en el servidor", () => {
        const { onFileChange, onRemoveChange } = renderInput();
        fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
        expect(onFileChange).toHaveBeenCalledWith(null);
        expect(onRemoveChange).toHaveBeenCalledWith(true);
    });
    it("sin imagen actual no ofrece quitar (el campo queda en blanco)", () => {
        renderInput({ currentUrl: null });
        expect(screen.queryByRole("button", { name: "Quitar" })).not.toBeInTheDocument();
    });
    it("restaurar cancela el borrado pedido", () => {
        const { onRemoveChange } = renderInput({ remove: true });
        fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
        expect(onRemoveChange).toHaveBeenCalledWith(false);
    });
});
