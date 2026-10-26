import { QueryFailedError } from 'typeorm';

import { createActor, InsufficientRoleError, Role } from '../../../../shared';
import type { Actor, TransactionContext } from '../../../../shared';
import { AccountNotFoundError } from '../../../identity';
import { BillingInvariantError } from '../../domain/errors/billing-invariant.error';
import { QuotaBelowUsageError } from '../../domain/errors/quota-below-usage.error';
import { QuotaInvalidError } from '../../domain/errors/quota-invalid.error';
import { ValidityNotExtendedError } from '../../domain/errors/validity-not-extended.error';

import { TypeOrmSubscriptionAdministrationRepository } from './typeorm-subscription-administration.repository';

const ADMIN: Actor = createActor('99999999-9999-4999-8999-999999999999', Role.ADMIN);
const ANA = '11111111-1111-4111-8111-111111111111';
const UNTIL = new Date('2026-12-01T06:00:00.000Z');
const EXPIRES = new Date('2026-11-20T15:30:00.000Z');

/** Una fila como la devuelve `pg`: `bigint` en texto y `timestamptz` en `Date`. */
const VIEW = {
  plan_slug: 'equipo',
  plan_nombre: 'Equipo',
  cuota_plan: '1000',
  estado: 'solo_lectura',
  vence_en: EXPIRES,
  extra: '500',
  hasta: UNTIL,
  espacio_usado: '1200',
  cuota_total: '1500',
};
const NO_VIEW = Object.fromEntries(Object.keys(VIEW).map((column) => [column, null]));

const setup = (rows: readonly object[] | Error) => {
  const query = jest.fn();
  if (rows instanceof Error) query.mockRejectedValue(rows);
  else query.mockResolvedValue(rows);
  const context = { requireActorScope: () => ({ query }) } as unknown as TransactionContext;
  return { repository: new TypeOrmSubscriptionAdministrationRepository(context), query };
};

const sqlFailure = (code: string): QueryFailedError =>
  new QueryFailedError('SELECT', [], Object.assign(new Error('falla'), { code }));

const quota = { clientId: ANA, extraBytes: 500n, until: UNTIL };
const validity = { clientId: ANA, expiresAt: UNTIL };

describe('TypeOrmSubscriptionAdministrationRepository (011b plan §3, §4)', () => {
  it('CA-1: limitsOf lee `limites_de_cuenta` y traduce la vista con bytes en bigint', async () => {
    const { repository, query } = setup([VIEW]);

    await expect(repository.limitsOf(ADMIN, ANA)).resolves.toEqual({
      planName: 'Equipo',
      isPersonal: false,
      status: 'solo_lectura',
      expiresAt: EXPIRES,
      planQuotaBytes: 1000n,
      extraQuotaBytes: 500n,
      extraQuotaUntil: UNTIL,
      usedBytes: 1200n,
      totalQuotaBytes: 1500n,
    });
    expect(query).toHaveBeenCalledWith('SELECT * FROM limites_de_cuenta($1::uuid)', [ANA]);
  });

  it('CA-3: limitsOf sin fila (cuenta sin suscripción) es `null`', async () => {
    await expect(setup([]).repository.limitsOf(ADMIN, ANA)).resolves.toBeNull();
  });

  it('RN-6: Personal se reconoce por su `slug`', async () => {
    const { repository } = setup([{ ...VIEW, plan_slug: 'personal', vence_en: null }]);

    await expect(repository.limitsOf(ADMIN, ANA)).resolves.toMatchObject({
      isPersonal: true,
      expiresAt: null,
    });
  });

  it('CA-1: adjustQuota llama a `ajustar_cuota_extra` con el extra en texto y devuelve la vista nueva', async () => {
    const { repository, query } = setup([{ codigo: 'ok', ...VIEW }]);

    await expect(repository.adjustQuota(ADMIN, quota)).resolves.toMatchObject({
      extraQuotaBytes: 500n,
    });
    expect(query).toHaveBeenCalledWith(
      'SELECT * FROM ajustar_cuota_extra($1::uuid, $2::bigint, $3::timestamptz)',
      [ANA, '500', UNTIL],
    );
  });

  it('CA-4: quitar el extra llama con `0` y `null`', async () => {
    const { repository, query } = setup([{ codigo: 'ok', ...VIEW }]);

    await repository.adjustQuota(ADMIN, { clientId: ANA, extraBytes: 0n, until: null });

    expect(query).toHaveBeenCalledWith(expect.any(String), [ANA, '0', null]);
  });

  it.each([
    ['quota_invalid', QuotaInvalidError],
    ['no_subscription', QuotaInvalidError],
    ['account_not_found', AccountNotFoundError],
  ] as const)('CA-3: el código `%s` de la cuota es %p', async (codigo, expected) => {
    const row = codigo === 'quota_invalid' ? { codigo, ...VIEW } : { codigo, ...NO_VIEW };

    await expect(setup([row]).repository.adjustQuota(ADMIN, quota)).rejects.toBeInstanceOf(
      expected,
    );
  });

  it('CA-2: `quota_below_usage` lleva el usado y el total resultante `plan + extra` pedido', async () => {
    const failure = setup([{ codigo: 'quota_below_usage', ...VIEW }]).repository.adjustQuota(
      ADMIN,
      { ...quota, extraBytes: 100n },
    );

    await expect(failure).rejects.toBeInstanceOf(QuotaBelowUsageError);
    await expect(failure).rejects.toMatchObject({
      status: 422,
      code: 'BACKOFFICE_QUOTA_BELOW_USAGE',
      details: { usedBytes: '1200', totalQuotaBytes: '1100' },
    });
  });

  it('CA-6: adjustValidity llama a `extender_vigencia` con el instante nuevo', async () => {
    const { repository, query } = setup([{ codigo: 'ok', ...VIEW, estado: 'vigente' }]);

    await expect(repository.adjustValidity(ADMIN, validity)).resolves.toMatchObject({
      status: 'vigente',
    });
    expect(query).toHaveBeenCalledWith(
      'SELECT * FROM extender_vigencia($1::uuid, $2::timestamptz)',
      [ANA, UNTIL],
    );
  });

  it.each([
    ['validity_not_extended', ValidityNotExtendedError],
    ['personal', ValidityNotExtendedError],
    ['no_subscription', ValidityNotExtendedError],
    ['account_not_found', AccountNotFoundError],
  ] as const)('CA-7: el código `%s` de la vigencia es %p', async (codigo, expected) => {
    await expect(
      setup([{ codigo, ...NO_VIEW }]).repository.adjustValidity(ADMIN, validity),
    ).rejects.toBeInstanceOf(expected);
  });

  it('CA-7: Personal se explica con «Personal no vence»', async () => {
    await expect(
      setup([{ codigo: 'personal', ...VIEW }]).repository.adjustValidity(ADMIN, validity),
    ).rejects.toThrow('Personal no vence');
  });

  it('un código desconocido es un invariante roto, no un error de dominio', async () => {
    await expect(
      setup([{ codigo: 'otro', ...VIEW }]).repository.adjustQuota(ADMIN, quota),
    ).rejects.toBeInstanceOf(BillingInvariantError);
  });

  it.each([
    [
      'limitsOf',
      (repository: TypeOrmSubscriptionAdministrationRepository) => repository.limitsOf(ADMIN, ANA),
    ],
    [
      'adjustQuota',
      (repository: TypeOrmSubscriptionAdministrationRepository) =>
        repository.adjustQuota(ADMIN, quota),
    ],
    [
      'adjustValidity',
      (repository: TypeOrmSubscriptionAdministrationRepository) =>
        repository.adjustValidity(ADMIN, validity),
    ],
  ] as const)(
    'CA-16: `42501` (rol distinto de ADMIN) en %s es `403 SHARED_FORBIDDEN`',
    async (_, call) => {
      await expect(call(setup(sqlFailure('42501')).repository)).rejects.toBeInstanceOf(
        InsufficientRoleError,
      );
    },
  );

  it('`21000` (conteo inesperado) es un invariante roto', async () => {
    await expect(
      setup(sqlFailure('21000')).repository.adjustValidity(ADMIN, validity),
    ).rejects.toBeInstanceOf(BillingInvariantError);
  });

  it('otro fallo de la base se propaga sin disfrazarse', async () => {
    const failure = sqlFailure('08006');

    await expect(setup(failure).repository.adjustQuota(ADMIN, quota)).rejects.toBe(failure);
  });
});
