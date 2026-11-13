import type { PlanAdminView } from '@nimbo/contracts';

/**
 * Planes del catálogo de administración (011 T-11), con los valores de la semilla de la 006a y los conteos del
 * mockup `backoffice/catalogo` (1 012 clientes con Personal, 186 con Pro, 52 con el equipo desactivado).
 */
export const PERSONAL_PLAN: PlanAdminView = {
  id: '10000000-0000-4000-8000-000000000001',
  slug: 'personal',
  name: 'Personal',
  description: 'Plan gratuito para uso individual',
  priceCents: 0,
  quotaBytes: '15000000000',
  maxFileBytes: '50000000',
  maxEditors: 0,
  agentQueriesPerMonth: 20,
  retainedVersions: 3,
  trashRetentionDays: 7,
  deactivatedAt: null,
  clientCount: 1012,
  isDefault: true,
};

export const PRO_PLAN: PlanAdminView = {
  ...PERSONAL_PLAN,
  id: '10000000-0000-4000-8000-000000000002',
  slug: 'pro',
  name: 'Pro',
  description: 'Plan profesional para usuarios exigentes',
  priceCents: 4500,
  quotaBytes: '100000000000',
  maxFileBytes: '500000000',
  maxEditors: 3,
  agentQueriesPerMonth: 500,
  retainedVersions: 30,
  trashRetentionDays: 30,
  clientCount: 186,
  isDefault: false,
};

/** El equipo desactivado: quien lo tiene lo conserva (RN-4). */
export const RETIRED_PLAN: PlanAdminView = {
  ...PRO_PLAN,
  id: '10000000-0000-4000-8000-000000000003',
  slug: 'equipo',
  name: 'Equipo',
  deactivatedAt: '2026-10-03T12:00:00.000Z',
  clientCount: 52,
};

/** El catálogo como lo devuelve la API: los planes en el orden del contrato. */
export const plansResponse = (plans: readonly PlanAdminView[]): { items: PlanAdminView[] } => ({
  items: [...plans],
});
