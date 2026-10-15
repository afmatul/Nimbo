/**
 * Las dos tarjetas del simulador de pagos (spec 009 RN-3), sin espacios: la primera aprueba siempre y la segunda
 * rechaza siempre. Las usan el simulador de `api`, la validación del cobro y el formulario de `web`.
 */
export const TEST_CARDS = Object.freeze({
  approved: '4242424242424242',
  rejected: '4000000000000002',
});
