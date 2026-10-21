import { toFieldIssues } from '../validation';

import {
  createPlanRequestSchema,
  planAdminListResponseSchema,
  planAdminViewSchema,
} from './catalog';

const PLAN_ID = '3a4b5c6d-7e8f-4a0b-9c1d-2e3f4a5b6c7d';
const AT = '2026-10-07T12:00:00.000Z';
/** 100 GiB: no cabe en un entero de 32 bits y viaja como texto decimal (ADR-0016). */
const HUNDRED_GIB = '107374182400';

const newPlan = {
  name: 'Pro Anual',
  description: 'Pro con descuento',
  priceCents: 45_000,
  quotaBytes: HUNDRED_GIB,
  maxFileBytes: '524288000',
  maxEditors: 3,
  agentQueriesPerMonth: 500,
  retainedVersions: 30,
  trashRetentionDays: 30,
};

const view = {
  ...newPlan,
  id: PLAN_ID,
  slug: 'pro-anual',
  deactivatedAt: null,
  clientCount: 4,
  isDefault: false,
};

const reasonsOf = (result: ReturnType<typeof createPlanRequestSchema.safeParse>): string[] =>
  result.success
    ? []
    : toFieldIssues(result.error).map(({ field, reason }) => `${field}:${reason}`);

describe('contratos del catálogo del backoffice (011 CA-8 a CA-11; plan §4)', () => {
  describe('PlanAdminView', () => {
    it('CA-8: un plan activo o desactivado, con su conteo de clientes y si es el de omisión', () => {
      expect(planAdminViewSchema.parse(view)).toEqual(view);
      expect(planAdminViewSchema.parse({ ...view, deactivatedAt: AT }).deactivatedAt).toBe(AT);
    });

    it('ADR-0016: los bytes viajan como texto decimal, nunca como número', () => {
      expect(planAdminViewSchema.safeParse({ ...view, quotaBytes: 107_374_182_400 }).success).toBe(
        false,
      );
    });

    it('lista blanca: un campo extra se rechaza', () => {
      expect(planAdminViewSchema.safeParse({ ...view, ownerEmail: 'ana@nimbo.me' }).success).toBe(
        false,
      );
    });

    it('CA-8: la lista va en `items` y es estricta', () => {
      expect(planAdminListResponseSchema.parse({ items: [view] })).toEqual({ items: [view] });
      expect(planAdminListResponseSchema.safeParse({ items: [], total: 0 }).success).toBe(false);
    });
  });

  describe('POST /backoffice/plans', () => {
    it('CA-9: acepta el plan con bytes como texto; el `slug` lo deriva el servidor', () => {
      expect(createPlanRequestSchema.parse(newPlan)).toEqual(newPlan);
    });

    it('CA-9: la descripción puede ser nula', () => {
      expect(
        createPlanRequestSchema.parse({ ...newPlan, description: null }).description,
      ).toBeNull();
    });

    it.each([
      ['un `slug` (lo deriva el servidor)', { slug: 'pro' }, 'slug:UNKNOWN_FIELD'],
      ['un `id`', { id: PLAN_ID }, 'id:UNKNOWN_FIELD'],
      ['bytes como número', { quotaBytes: 1024 }, 'quotaBytes:INVALID'],
      ['un precio con decimales', { priceCents: 10.5 }, 'priceCents:INVALID'],
    ])('rechaza %s con el campo y su motivo', (_case, patch, reason) => {
      expect(reasonsOf(createPlanRequestSchema.safeParse({ ...newPlan, ...patch }))).toEqual([
        reason,
      ]);
    });

    it('un campo ausente es `REQUIRED`', () => {
      const { name: _name, ...withoutName } = newPlan;

      expect(reasonsOf(createPlanRequestSchema.safeParse(withoutName))).toEqual(['name:REQUIRED']);
    });
  });
});
