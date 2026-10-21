/** Desglose de un precio con IVA incluido (spec 009 RN-2), en centavos enteros. */
export interface PriceBreakdown {
  readonly subtotalCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
}

/** IVA de Guatemala: el precio de catálogo es el 112 % del subtotal. */
const PRICE_PERCENT_WITH_VAT = 112;
const PERCENT = 100;

/**
 * RN-2: `subtotal = precio × 100 / 112` redondeado al centavo con las mitades hacia arriba, en aritmética entera;
 * `IVA = precio − subtotal`. Función pura: la usan la API (factura) y el formulario de pago (resumen).
 */
export const breakdown = (priceCents: number): PriceBreakdown => {
  const subtotalCents = Math.floor(
    (priceCents * PERCENT + PRICE_PERCENT_WITH_VAT / 2) / PRICE_PERCENT_WITH_VAT,
  );
  return { subtotalCents, vatCents: priceCents - subtotalCents, totalCents: priceCents };
};
