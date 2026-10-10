import { z } from 'zod';

/** Esquemas del catálogo de planes (spec 008, plan §4). */

const count = z.number().int().nonnegative();

/** Bytes como texto decimal para no perder precisión en JSON (ADR-0016). */
const decimalBytes = z.string().regex(/^\d+$/);

/** Un plan del catálogo: dinero en centavos enteros y bytes como texto decimal. Base de las vistas de plan de otras specs. */
export const planSchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  name: z.string(),
  description: z.string().nullable(),
  priceCents: count,
  quotaBytes: decimalBytes,
  maxFileBytes: decimalBytes,
  maxEditors: count,
  agentQueriesPerMonth: count,
  retainedVersions: count,
  trashRetentionDays: count,
});

/** `GET /billing/plans` (008 CA-1): planes activos en el orden de RN-2. */
export const planCatalogResponseSchema = z.object({
  plans: z.array(planSchema),
});

export type Plan = z.infer<typeof planSchema>;
export type PlanCatalogResponse = z.infer<typeof planCatalogResponseSchema>;
