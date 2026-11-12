import { describe, expect, it } from "vitest";
import { canAdjustStock, canManageCatalog, canManageClients, canManageCompany, canManagePurchases, canViewClients, canViewInventory, canViewPurchases, canViewSuppliers, initials, isAdmin, } from "./roles";
describe("roles", () => {
    it("solo el admin gestiona la empresa", () => {
        expect(canManageCompany("admin")).toBe(true);
        expect(canManageCompany("vendedor")).toBe(false);
        expect(canManageCompany(undefined)).toBe(false);
    });
    it("identifica al administrador", () => {
        expect(isAdmin("admin")).toBe(true);
        expect(isAdmin("cobrador")).toBe(false);
    });
    it("genera iniciales a partir del nombre", () => {
        expect(initials("Wilmer Vargas")).toBe("WV");
        expect(initials("Ana")).toBe("A");
    });
    it("aplica la matriz de clientes", () => {
        expect(canViewClients("cobrador")).toBe(true);
        expect(canManageClients("cobrador")).toBe(false);
        expect(canManageClients("vendedor")).toBe(true);
        expect(canViewClients("almacenista")).toBe(false);
    });
    it("aplica la matriz de inventario", () => {
        expect(canViewInventory("vendedor")).toBe(true);
        expect(canManageCatalog("vendedor")).toBe(false);
        expect(canManageCatalog("admin")).toBe(true);
        expect(canAdjustStock("almacenista")).toBe(true);
        expect(canAdjustStock("vendedor")).toBe(false);
    });
    it("limita proveedores a administración y almacén", () => {
        expect(canViewSuppliers("almacenista")).toBe(true);
        expect(canViewSuppliers("vendedor")).toBe(false);
    });
    it("limita compras a administración y almacén", () => {
        expect(canViewPurchases("admin")).toBe(true);
        expect(canViewPurchases("almacenista")).toBe(true);
        expect(canViewPurchases("vendedor")).toBe(false);
        expect(canManagePurchases("cobrador")).toBe(false);
        expect(canManagePurchases(undefined)).toBe(false);
    });
});
