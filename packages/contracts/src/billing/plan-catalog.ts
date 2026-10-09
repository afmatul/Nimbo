import { z } from 'zod';

export const BILLING_ERROR_CODES = {
  PLAN_CATALOG_UNAVAILABLE: 'PLAN_CATALOG_UNAVAILABLE',
} as const;

export type BillingErrorCode = (typeof BILLING_ERROR_CODES)[keyof typeof BILLING_ERROR_CODES];

export const PlanDtoSchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  precioCentavos: z.number().int(),
  cuotaBytes: z.string().regex(/^\d+$/),
  maxArchivoBytes: z.string().regex(/^\d+$/),
  maxEditores: z.number().int(),
  consultasAgenteMensual: z.number().int(),
  versionesRetenidas: z.number().int(),
  diasRetencionPapelera: z.number().int(),
});

export const PlanCatalogResponseSchema = z.object({
  planes: z.array(PlanDtoSchema),
});

export type PlanDto = z.infer<typeof PlanDtoSchema>;
export type PlanCatalogResponse = z.infer<typeof PlanCatalogResponseSchema>;
