const CENTS_PER_QUETZAL = 100;
/** Separador de miles del mockup: espacio de no separación (2 000, 10 000). */
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;
const NO_BREAK_SPACE = '\u00A0';

/**
 * Centavos enteros a quetzales con dos decimales (spec 009 RN-1, ADR-0028): Q0.00, Q110.00, Q1 234.56. Única función de
 * formato de dinero: la usan la factura PDF de `api` y las pantallas de `web`.
 */
export const formatGtq = (cents: number): string => {
  const quetzales = Math.trunc(cents / CENTS_PER_QUETZAL);
  const rest = String(cents % CENTS_PER_QUETZAL).padStart(2, '0');
  return `Q${quetzales.toString().replace(THOUSANDS, NO_BREAK_SPACE)}.${rest}`;
};
