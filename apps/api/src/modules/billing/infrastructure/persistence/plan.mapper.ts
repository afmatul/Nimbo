import { Plan } from '../../domain/plan.entity';

import type { PlanOrmEntity } from './plan.orm-entity';

/** Fila de `plan` → `Plan` (ya cumplió las reglas al crearse y los CHECK de la tabla). */
export const toPlan = (row: PlanOrmEntity): Plan =>
  Plan.rehydrate({
    id: row.id,
    slug: row.slug,
    name: row.nombre,
    description: row.descripcion,
    priceCents: row.precioCentavos,
    limits: {
      quotaBytes: row.cuotaBytes,
      maxFileBytes: row.maxArchivoBytes,
      maxEditors: row.maxEditores,
      agentQueriesPerMonth: row.consultasAgenteMensual,
      retainedVersions: row.versionesRetenidas,
      trashRetentionDays: row.diasRetencionPapelera,
    },
    deactivatedAt: row.desactivadoEn,
  });

/** `Plan` nuevo → columnas de `plan` (las fechas de alta y cambio las pone la base). */
export const toPlanRow = (plan: Plan): Partial<PlanOrmEntity> => ({
  id: plan.id,
  slug: plan.slug,
  nombre: plan.name,
  descripcion: plan.description,
  precioCentavos: plan.priceCents,
  cuotaBytes: plan.limits.quotaBytes,
  maxArchivoBytes: plan.limits.maxFileBytes,
  maxEditores: plan.limits.maxEditors,
  consultasAgenteMensual: plan.limits.agentQueriesPerMonth,
  versionesRetenidas: plan.limits.retainedVersions,
  diasRetencionPapelera: plan.limits.trashRetentionDays,
  desactivadoEn: plan.deactivatedAt,
});
