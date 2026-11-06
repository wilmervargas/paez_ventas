const quantityFormatter = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

/** Formatea cantidades (stock, unidades) sin convertirlas a número para operar. */
export function formatQuantity(value: string | number): string {
  const amount = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(amount)) {
    return "—";
  }
  return quantityFormatter.format(amount);
}
