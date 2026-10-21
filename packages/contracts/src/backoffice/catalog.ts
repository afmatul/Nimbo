import { z } from 'zod';

import { planSchema } from '../billing';

/**
 * Catálogo de planes del backoffice (spec 011 CA-8 a CA-11; plan §4). Se construye sobre el único esquema de plan de
 * `billing` (R-5): mismos campos, bytes como texto decimal y centavos enteros (ADR-0016).
 */

/** Un plan visto por el Administrador: activo o desactivado, cuántos clientes lo tienen y si es Personal (CA-8). */
export const planAdminViewSchema = planSchema
  .extend({
    deactivatedAt: z.string().datetime().nullable(),
    clientCount: z.number().int().nonnegative(),
    isDefault: z.boolean(),
  })
  .strict();

/** `GET /backoffice/plans`: todos los planes, activos y desactivados, en el orden del catálogo. */
export const planAdminListResponseSchema = z
  .object({ items: z.array(planAdminViewSchema) })
  .strict();

/**
 * `POST /backoffice/plans` (CA-9): el plan sin `id` ni `slug`, que deriva el servidor. Aquí solo la forma; las reglas de
 * CA-11 (precio, límites, máximo por archivo, nombre único) las valida `billing` y responde `422 BILLING_PLAN_INVALID`.
 */
export const createPlanRequestSchema = planSchema.omit({ id: true, slug: true }).strict();

export type PlanAdminView = z.infer<typeof planAdminViewSchema>;
export type PlanAdminListResponse = z.infer<typeof planAdminListResponseSchema>;
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;
