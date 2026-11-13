/** «Plan y facturación» del cliente (spec 009 CA-7, CA-8): plan vigente, pagos y facturas. */
export const PLAN_AND_BILLING_PATH = '/suscripcion';

/** Elegir el plan del siguiente ciclo (spec 010 CA-16 a CA-18). */
export const CHANGE_PLAN_PATH = '/suscripcion/cambiar-plan';

/** Pago de la renovación manual (spec 010 CA-8 a CA-10); también lo abre «Renovar plan» del aviso de solo lectura. */
export const RENEW_PATH = '/suscripcion/renovar';

/** Pantalla de pago de un plan (spec 009 CA-9): la abre «Contratar» con el `slug` que trae el catálogo de la 008. */
export const SUBSCRIBE_PATH = '/planes/contratar';

export const subscribeHref = (slug: string): string =>
  `${SUBSCRIBE_PATH}?slug=${encodeURIComponent(slug)}`;
