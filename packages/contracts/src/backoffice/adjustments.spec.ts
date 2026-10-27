import type { z } from 'zod';

import { toFieldIssues } from '../validation';

import {
  ACCOUNT_LIMITS_STATUSES,
  accountLimitsSchema,
  adjustQuotaRequestSchema,
  adjustValidityRequestSchema,
  isCalendarDay,
} from './adjustments';
import { BACKOFFICE_FIELD_MESSAGES } from './error-codes';

/** 2^53-1: el tope técnico de bytes (RN-1, RN-8). */
const MAX_SAFE_BYTES = '9007199254740991';
const AT = '2026-12-01T06:00:00.000Z';
const FIVE_GIB = '5368709120';
const PRO_QUOTA = '107374182400';

const paidLimits = {
  status: 'active',
  planName: 'Pro',
  usedBytes: '1024',
  baseQuotaBytes: PRO_QUOTA,
  extraQuotaBytes: FIVE_GIB,
  extraQuotaUntil: AT,
  totalQuotaBytes: '112742891520',
  expiresAt: AT,
};

const withoutSubscription = {
  status: 'none',
  planName: null,
  usedBytes: '0',
  baseQuotaBytes: null,
  extraQuotaBytes: '0',
  extraQuotaUntil: null,
  totalQuotaBytes: null,
  expiresAt: null,
};

function reasonsOf(schema: z.ZodTypeAny, input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success ? [] : toFieldIssues(result.error).map((i) => `${i.field}:${i.reason}`);
}

describe('adjustQuotaRequestSchema (011b CA-3, RN-1)', () => {
  it('CA-1: acepta un extra en bytes como texto decimal y un día `YYYY-MM-DD`', () => {
    const body = { extraBytes: FIVE_GIB, until: '2026-11-30' };

    expect(adjustQuotaRequestSchema.parse(body)).toEqual(body);
  });

  it('RN-1: admite el tope técnico exacto, 2^53-1', () => {
    expect(
      adjustQuotaRequestSchema.safeParse({ extraBytes: MAX_SAFE_BYTES, until: '2026-11-30' })
        .success,
    ).toBe(true);
  });

  it.each([
    ['cero (se quita con DELETE)', '0'],
    ['un negativo', '-1'],
    ['ceros a la izquierda', '05'],
    ['un decimal', '1.5'],
    ['un número de JSON', 1024],
    ['más de 2^53-1', '9007199254740992'],
    ['17 dígitos', '10000000000000000'],
    ['ausente', undefined],
  ])('CA-3: el extra como %s es `INVALID_EXTRA_BYTES`', (_case, extraBytes) => {
    expect(reasonsOf(adjustQuotaRequestSchema, { extraBytes, until: '2026-11-30' })).toEqual([
      'extraBytes:INVALID_EXTRA_BYTES',
    ]);
  });

  it.each([
    ['otro formato', '30/11/2026'],
    ['un instante', AT],
    ['un día que no existe', '2026-02-30'],
    ['un mes que no existe', '2026-13-01'],
    ['ausente', undefined],
  ])('CA-3: el día como %s es `INVALID_DAY`', (_case, until) => {
    expect(reasonsOf(adjustQuotaRequestSchema, { extraBytes: FIVE_GIB, until })).toEqual([
      'until:INVALID_DAY',
    ]);
  });

  it('es estricto: no admite la cuota del plan ni el total', () => {
    expect(
      reasonsOf(adjustQuotaRequestSchema, {
        extraBytes: FIVE_GIB,
        until: '2026-11-30',
        totalQuotaBytes: PRO_QUOTA,
      }),
    ).toEqual(['totalQuotaBytes:UNKNOWN_FIELD']);
  });

  it('cada `reason` nuevo tiene su mensaje con la acción correctiva', () => {
    const result = adjustQuotaRequestSchema.safeParse({ extraBytes: '0', until: 'mañana' });

    expect(result.success ? [] : toFieldIssues(result.error).map((i) => i.message)).toEqual([
      BACKOFFICE_FIELD_MESSAGES.INVALID_EXTRA_BYTES,
      BACKOFFICE_FIELD_MESSAGES.INVALID_DAY,
    ]);
  });
});

describe('adjustValidityRequestSchema (011b CA-6, CA-7, RN-2)', () => {
  it('CA-6: acepta un día `YYYY-MM-DD`', () => {
    expect(adjustValidityRequestSchema.parse({ expiresAt: '2026-12-15' })).toEqual({
      expiresAt: '2026-12-15',
    });
  });

  it.each([['2026-12-32'], ['2026-1-05'], [AT], [20261215], [undefined]])(
    'CA-7: %p es `INVALID_DAY`',
    (expiresAt) => {
      expect(reasonsOf(adjustValidityRequestSchema, { expiresAt })).toEqual([
        'expiresAt:INVALID_DAY',
      ]);
    },
  );

  it('es estricto: no admite estado, renovación ni plan', () => {
    expect(
      reasonsOf(adjustValidityRequestSchema, { expiresAt: '2026-12-15', status: 'vigente' }),
    ).toEqual(['status:UNKNOWN_FIELD']);
  });
});

describe('accountLimitsSchema (011b CA-1, CA-3, HU-5)', () => {
  it('declara los cuatro estados de la ficha', () => {
    expect([...ACCOUNT_LIMITS_STATUSES]).toEqual(['active', 'readOnly', 'personal', 'none']);
  });

  it('CA-1: un plan de pago trae base, extra, total y vencimientos', () => {
    expect(accountLimitsSchema.parse(paidLimits)).toEqual(paidLimits);
  });

  it('CA-3: sin suscripción, `status: none` con base y total `null`', () => {
    expect(accountLimitsSchema.parse(withoutSubscription)).toEqual(withoutSubscription);
  });

  it('RN-6: Personal no vence (`expiresAt: null`) y admite un extra', () => {
    const personal = { ...paidLimits, status: 'personal', planName: 'Personal', expiresAt: null };

    expect(accountLimitsSchema.parse(personal)).toEqual(personal);
  });

  it.each([
    ['bytes como número', { usedBytes: 1024 }],
    ['un estado desconocido', { status: 'solo_lectura' }],
    ['un vencimiento que no es instante', { expiresAt: '2026-12-01' }],
    ['un campo extra', { planId: '10000000-0000-4000-8000-000000000002' }],
  ])('es estricto: rechaza %s', (_case, patch) => {
    expect(accountLimitsSchema.safeParse({ ...paidLimits, ...patch }).success).toBe(false);
  });
});

describe('isCalendarDay (011b CA-3, CA-7)', () => {
  it.each(['2026-11-30', '2028-02-29', '2026-01-01'])('%s es un día del calendario', (day) => {
    expect(isCalendarDay(day)).toBe(true);
  });

  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-11-31', '30/11/2026', AT, ''])(
    '%p no es un día del calendario',
    (day) => {
      expect(isCalendarDay(day)).toBe(false);
    },
  );
});
