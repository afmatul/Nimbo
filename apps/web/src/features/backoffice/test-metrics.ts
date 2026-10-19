import type { BackofficeMetricsResponse } from '@nimbo/contracts';

const PLAN_IDS = {
  personal: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  pro: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
  team: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
  team2027: '4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f8a',
  institutional: '5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8a9b',
} as const;

/** 39,4 TB de `usuario.espacio_usado` sumados (bytes como texto, ADR-0016). */
const USED_BYTES_TOTAL = '39400000000000';

/** Datos del mockup `backoffice/metricas` (default): 1 284 cuentas, 1 272 de clientes, todas con plan. */
export function metricsResponse(
  overrides: Partial<BackofficeMetricsResponse> = {},
): BackofficeMetricsResponse {
  return {
    accounts: {
      total: 1284,
      clients: 1272,
      internal: 12,
      byStatus: { active: 1275, suspended: 9 },
    },
    usedBytesTotal: USED_BYTES_TOTAL,
    byPlan: [
      { planId: PLAN_IDS.personal, name: 'Personal', deactivatedAt: null, clientCount: 1012 },
      { planId: PLAN_IDS.pro, name: 'Pro', deactivatedAt: null, clientCount: 186 },
      { planId: PLAN_IDS.team, name: 'Equipo', deactivatedAt: null, clientCount: 52 },
      {
        planId: PLAN_IDS.institutional,
        name: 'Institucional',
        deactivatedAt: null,
        clientCount: 22,
      },
    ],
    ...overrides,
  };
}

/**
 * Mockup `con-plan-inactivo`: Equipo desactivado con 52 cuentas y Equipo 2027 activo con 0, en el orden del catálogo
 * (por precio), como llegan de la API: el inactivo en medio.
 */
export const WITH_INACTIVE_PLAN = metricsResponse({
  byPlan: [
    { planId: PLAN_IDS.personal, name: 'Personal', deactivatedAt: null, clientCount: 1012 },
    { planId: PLAN_IDS.pro, name: 'Pro', deactivatedAt: null, clientCount: 186 },
    {
      planId: PLAN_IDS.team,
      name: 'Equipo',
      deactivatedAt: '2026-10-10T12:00:00.000Z',
      clientCount: 52,
    },
    { planId: PLAN_IDS.team2027, name: 'Equipo 2027', deactivatedAt: null, clientCount: 0 },
    { planId: PLAN_IDS.institutional, name: 'Institucional', deactivatedAt: null, clientCount: 22 },
  ],
});
