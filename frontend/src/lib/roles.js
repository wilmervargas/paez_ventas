export const ROLE_LABELS = {
    admin: "Administrador",
    vendedor: "Vendedor",
    cobrador: "Cobrador",
    almacenista: "Almacenista",
};
export function canManageCompany(rol) {
    return rol === "admin";
}
export function isAdmin(rol) {
    return rol === "admin";
}
export function canViewClients(rol) {
    return rol === "admin" || rol === "vendedor" || rol === "cobrador";
}
export function canManageClients(rol) {
    return rol === "admin" || rol === "vendedor";
}
export function canViewSuppliers(rol) {
    return rol === "admin" || rol === "almacenista";
}
export function canManageSuppliers(rol) {
    return rol === "admin" || rol === "almacenista";
}
export function canViewInventory(rol) {
    return rol === "admin" || rol === "vendedor" || rol === "almacenista";
}
export function canManageCatalog(rol) {
    return rol === "admin";
}
export function canAdjustStock(rol) {
    return rol === "admin" || rol === "almacenista";
}
/** Solo el administrador mantiene el histórico de tasas. */
export function canManageRates(rol) {
    return rol === "admin";
}
export function canViewPurchases(rol) {
    return rol === "admin" || rol === "almacenista";
}
export function canManagePurchases(rol) {
    return rol === "admin" || rol === "almacenista";
}
export function canViewOrders(rol) {
    return rol === "admin" || rol === "vendedor" || rol === "cobrador" || rol === "almacenista";
}
export function canManageOrders(rol) {
    return rol === "admin" || rol === "vendedor";
}
export function canConfirmOrders(rol) {
    return rol === "admin" || rol === "vendedor";
}
export function canCancelOrders(rol) {
    return rol === "admin";
}
export function canDeliverOrders(rol) {
    return rol === "admin" || rol === "vendedor" || rol === "almacenista";
}
export function initials(nombre) {
    return nombre
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}
