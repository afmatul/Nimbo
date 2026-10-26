import { createActor, Role } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';

import type { ISubscriptionAdministrationReader } from './ports/i-subscription-administration.reader.port';
import type {
  ISubscriptionAdministrationRepository,
  SubscriptionLimits,
} from './ports/i-subscription-administration.repository.port';
import { SubscriptionAdministration } from './subscription-administration';

const ADMIN: Actor = createActor('99999999-9999-4999-8999-999999999999', Role.ADMIN);
const ANA = '11111111-1111-4111-8111-111111111111';
const TEAM_ID = '10000000-0000-4000-8000-000000000003';
const LIMITS: SubscriptionLimits = {
  planName: 'Equipo',
  isPersonal: false,
  status: 'vigente',
  expiresAt: new Date('2026-12-01T06:00:00.000Z'),
  planQuotaBytes: 1000n,
  extraQuotaBytes: 0n,
  extraQuotaUntil: null,
  usedBytes: 10n,
  totalQuotaBytes: 1000n,
};

const setup = () => {
  const scopes: string[] = [];
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('la administración lee con el actor')),
    withActor: (actor, work) => {
      scopes.push(actor.id);
      return work();
    },
  };
  const reader: ISubscriptionAdministrationReader = {
    planNamesFor: jest.fn().mockResolvedValue(new Map([[ANA, 'Equipo']])),
    clientCountsByPlan: jest.fn().mockResolvedValue([{ planId: TEAM_ID, clientCount: 2 }]),
  };
  const repository: jest.Mocked<ISubscriptionAdministrationRepository> = {
    limitsOf: jest.fn().mockResolvedValue(LIMITS),
    adjustQuota: jest.fn().mockResolvedValue(LIMITS),
    adjustValidity: jest.fn().mockResolvedValue(LIMITS),
  };
  const administration = new SubscriptionAdministration(transactions, reader, repository);
  return { administration, scopes, reader, repository };
};

describe('SubscriptionAdministration (spec 009 T-03; arreglos-011 puntos 1 a 4)', () => {
  it('011 CA-1: nombres de plan por cliente, dentro de withActor del administrador', async () => {
    const { administration, scopes, reader } = setup();

    const names = await administration.planNamesFor(ADMIN, [ANA]);

    expect(names.get(ANA)).toBe('Equipo');
    expect(scopes).toEqual([ADMIN.id]);
    expect(reader.planNamesFor).toHaveBeenCalledWith(ADMIN, [ANA]);
  });

  it('sin clientes en la página, no consulta', async () => {
    const { administration, reader } = setup();

    await expect(administration.planNamesFor(ADMIN, [])).resolves.toEqual(new Map());
    expect(reader.planNamesFor).not.toHaveBeenCalled();
  });

  it('011 CA-8, CA-12: clientes por plan, sin parámetro `clientCount` (punto 2)', async () => {
    const { administration, scopes } = setup();

    await expect(administration.clientCountsByPlan(ADMIN)).resolves.toEqual([
      { planId: TEAM_ID, clientCount: 2 },
    ]);
    expect(scopes).toEqual([ADMIN.id]);
  });
});

describe('SubscriptionAdministration: límites y ajustes (011b plan §2)', () => {
  it('HU-5, CA-1: limitsOf lee la vista dentro de withActor del administrador', async () => {
    const { administration, scopes, repository } = setup();

    await expect(administration.limitsOf(ADMIN, ANA)).resolves.toBe(LIMITS);
    expect(scopes).toEqual([ADMIN.id]);
    expect(repository.limitsOf).toHaveBeenCalledWith(ADMIN, ANA);
  });

  it('CA-1: adjustQuota convierte el último día a las 00:00 del día siguiente en Guatemala', async () => {
    const { administration, scopes, repository } = setup();

    await administration.adjustQuota(ADMIN, {
      clientId: ANA,
      extra: { bytes: 500n, lastDay: '2026-11-30' },
    });

    expect(scopes).toEqual([ADMIN.id]);
    expect(repository.adjustQuota).toHaveBeenCalledWith(ADMIN, {
      clientId: ANA,
      extraBytes: 500n,
      until: new Date('2026-12-01T06:00:00.000Z'),
    });
  });

  it('CA-4: quitar el extra es `0n` y sin fecha', async () => {
    const { administration, repository } = setup();

    await administration.adjustQuota(ADMIN, { clientId: ANA, extra: null });

    expect(repository.adjustQuota).toHaveBeenCalledWith(ADMIN, {
      clientId: ANA,
      extraBytes: 0n,
      until: null,
    });
  });

  it('CA-6, CA-8: adjustValidity solo envía el `vence_en` nuevo; no toca renovación ni cambio programado', async () => {
    const { administration, scopes, repository } = setup();

    await expect(
      administration.adjustValidity(ADMIN, { clientId: ANA, lastDay: '2026-12-31' }),
    ).resolves.toBe(LIMITS);

    expect(scopes).toEqual([ADMIN.id]);
    expect(repository.adjustValidity).toHaveBeenCalledWith(ADMIN, {
      clientId: ANA,
      expiresAt: new Date('2027-01-01T06:00:00.000Z'),
    });
    expect(repository.adjustQuota).not.toHaveBeenCalled();
  });
});
