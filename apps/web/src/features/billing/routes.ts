/** Catálogo público de planes (008). */
export const PLANS_PATH = '/planes';

/** «Plan y facturación» del cliente (spec 009 CA-7, CA-8): plan vigente, pagos y facturas. */
export const PLAN_AND_BILLING_PATH = '/suscripcion';

/** Pantalla de pago de un plan (spec 009 CA-9): la abre «Contratar» con el `slug` que trae el catálogo de la 008. */
export const SUBSCRIBE_PATH = '/planes/contratar';

export const subscribeHref = (slug: string): string =>
  `${SUBSCRIBE_PATH}?slug=${encodeURIComponent(slug)}`;
