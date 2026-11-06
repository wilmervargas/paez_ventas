import type { Rol } from "../types/auth";

export const ROLE_LABELS: Record<Rol, string> = {
  admin: "Administrador",
  vendedor: "Vendedor",
  cobrador: "Cobrador",
  almacenista: "Almacenista",
};

export function canManageCompany(rol: Rol | undefined): boolean {
  return rol === "admin";
}

export function isAdmin(rol: Rol | undefined): boolean {
  return rol === "admin";
}

export function canViewClients(rol: Rol | undefined): boolean {
  return rol === "admin" || rol === "vendedor" || rol === "cobrador";
}

export function canManageClients(rol: Rol | undefined): boolean {
  return rol === "admin" || rol === "vendedor";
}

export function canViewSuppliers(rol: Rol | undefined): boolean {
  return rol === "admin" || rol === "almacenista";
}

export function canManageSuppliers(rol: Rol | undefined): boolean {
  return rol === "admin" || rol === "almacenista";
}

export function canViewInventory(rol: Rol | undefined): boolean {
  return rol === "admin" || rol === "vendedor" || rol === "almacenista";
}

export function canManageCatalog(rol: Rol | undefined): boolean {
  return rol === "admin";
}

export function canAdjustStock(rol: Rol | undefined): boolean {
  return rol === "admin" || rol === "almacenista";
}

export function canViewPurchases(rol: Rol | undefined): boolean {
  return rol === "admin" || rol === "almacenista";
}

export function canManagePurchases(rol: Rol | undefined): boolean {
  return rol === "admin" || rol === "almacenista";
}

export function initials(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
