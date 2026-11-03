import type {
  Actor,
  IPasswordHasher,
  IRateLimiter,
  ITransactionRunner,
  RateLimitDecision,
} from '../../../shared';
import {
  createActor,
  FixedClock,
  PasswordHash,
  RateLimitExceededError,
  Role,
} from '../../../shared';
import { Action } from '../../access';
import { AuditAction } from '../../audit';
import type { AuditRecord, IAuditLogger } from '../../audit';
import { NodeNotFoundError } from '../../storage';
import { PublicLinkNotFoundError } from '../domain/errors';
import { LinkToken } from '../domain/link-token';
import { PublicLink } from '../domain/public-link';

import type { IPublicLinkRepository } from './ports/i-public-link.repository.port';
import { PublicLinkService } from './public-link.service';
import type { CreatePublicLinkCommand } from './public-link.service';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const FILE_ID = '33333333-3333-4333-8333-333333333333';
const PREVIOUS_ID = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-10-31T10:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_PER_MINUTE = 20;
const PASSWORD = 'clave-de-prueba-7f3a';
const PASSWORD_HASH = PasswordHash.fromPhc('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA');

/** Error que el doble de `WritableAccountPolicy` lanza en solo lectura (el real es de `storage`). */
class ReadOnlyForTest extends Error {}

const previousLink = (expiresAt = new Date(NOW.getTime() + DAY_MS)): PublicLink =>
  PublicLink.rehydrate({
    id: PREVIOUS_ID,
    fileId: FILE_ID,
    ownerId: ANA.id,
    tokenHash: LinkToken.hashOf('anterior'),
    passwordHash: null,
    expiresAt,
    createdAt: new Date(NOW.getTime() - DAY_MS),
  });

const command = (overrides: Partial<CreatePublicLinkCommand> = {}): CreatePublicLinkCommand => ({
  fileId: FILE_ID,
  expiresInDays: 7,
  ...overrides,
});

interface SetupOptions {
  readonly allowed?: boolean;
  readonly file?: { id: string; name: string; sizeBytes: bigint } | null;
  readonly readOnly?: boolean;
  readonly rate?: RateLimitDecision;
  /** Lo que da `replace`: `null` si el archivo dejó de ser propio y vivo. */
  readonly replaced?: { previous: PublicLink | null } | null;
  /** Lo que da `findCurrent`: el enlace sin revocar del archivo, o `null`. */
  readonly current?: PublicLink | null;
  /** Lo que da `revoke`: el enlace recién revocado, o `null` si es ajeno, inexistente o ya revocado. */
  readonly revoked?: PublicLink | null;
}

const setup = (options: SetupOptions = {}) => {
  const journal: string[] = [];
  const step =
    <T>(name: string, value: T) =>
    (): Promise<T> => {
      journal.push(name);
      return Promise.resolve(value);
    };
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('generar corre con el actor')),
    withActor: async (actor, work) => {
      journal.push(`tx:${actor.id}`);
      const result = await work();
      journal.push('commit');
      return result;
    },
  };
  const rateLimiter: IRateLimiter = {
    consume: jest.fn(step('rate', options.rate ?? { allowed: true })),
  };
  const permissions = { can: jest.fn(step('can', options.allowed ?? true)) };
  const files = {
    findOwnedFile: jest.fn(
      step(
        'findOwnedFile',
        options.file === undefined ? { id: FILE_ID, name: 'x.pdf', sizeBytes: 1n } : options.file,
      ),
    ),
  };
  const links: IPublicLinkRepository = {
    replace: jest.fn(
      step('replace', options.replaced === undefined ? { previous: null } : options.replaced),
    ),
    findCurrent: jest.fn(step('findCurrent', options.current ?? null)),
    revoke: jest.fn(
      step('revoke', options.revoked === undefined ? previousLink() : options.revoked),
    ),
  };
  const writable = {
    assertWritable: jest.fn(() => {
      journal.push('writable');
      return options.readOnly === true ? Promise.reject(new ReadOnlyForTest()) : Promise.resolve();
    }),
  };
  const hasher: IPasswordHasher = {
    hash: jest.fn(step('hash', PASSWORD_HASH)),
    verify: () => Promise.reject(new Error('generar no verifica')),
  };
  const recorded: AuditRecord[] = [];
  const audit: IAuditLogger = {
    record: () => Promise.reject(new Error('la auditoría va en la transacción')),
    recordInTransaction: jest.fn((entry: AuditRecord) => {
      journal.push(`audit:${entry.action}`);
      recorded.push(entry);
      return Promise.resolve();
    }),
  };
  const logger = { info: jest.fn(), warn: jest.fn() };
  const service = new PublicLinkService(
    transactions,
    permissions,
    files,
    links,
    writable,
    hasher,
    rateLimiter,
    audit,
    new FixedClock(NOW),
    { shareAttemptsPerMinute: RATE_LIMIT_PER_MINUTE, webPublicUrl: 'https://nimbo.test' },
    logger,
  );
  return {
    service,
    journal,
    recorded,
    links,
    rateLimiter,
    permissions,
    hasher,
    writable,
    logger,
  };
};

describe('PublicLinkService.createLink (plan 013 §2, §5)', () => {
  it('CA-1: límite → `can` y archivo propio → solo lectura → hash fuera de la transacción → reemplazo y auditoría en otra', async () => {
    const { service, journal, permissions } = setup();

    await service.createLink(ANA, command({ password: PASSWORD }));

    expect(journal).toEqual([
      'rate',
      `tx:${ANA.id}`,
      'can',
      'findOwnedFile',
      'commit',
      'writable',
      'hash',
      `tx:${ANA.id}`,
      'replace',
      'audit:public_link.created',
      'commit',
    ]);
    expect(permissions.can).toHaveBeenCalledWith(ANA, FILE_ID, Action.CREATE_PUBLIC_LINK);
  });

  it('CA-1: devuelve el resumen activo y el token cuyo hash guarda el repositorio; sin contraseña no hashea', async () => {
    const { service, links, hasher } = setup();

    const { link, token } = await service.createLink(ANA, command({ expiresInDays: 30 }));

    expect(link).toEqual({
      id: expect.any(String) as string,
      fileId: FILE_ID,
      expiresAt: new Date(NOW.getTime() + 30 * DAY_MS),
      hasPassword: false,
      status: 'active',
      createdAt: NOW,
    });
    const stored = (links.replace as jest.Mock).mock.calls[0][1] as PublicLink;
    expect(stored.toSnapshot()).toMatchObject({ id: link.id, tokenHash: token.hash() });
    expect(hasher.hash).not.toHaveBeenCalled();
  });

  it('CA-1, CA-15: `public_link.created` con vencimiento y protección, sin token ni contraseña; la bitácora solo con ids', async () => {
    const { service, recorded, logger } = setup();

    const { link, token } = await service.createLink(ANA, command({ password: PASSWORD }));

    expect(recorded).toEqual([
      {
        action: AuditAction.PUBLIC_LINK_CREATED,
        actor: ANA,
        targetUserId: ANA.id,
        resourceId: FILE_ID,
        attributes: { expiresInDays: 7, protection: 'password' },
      },
    ]);
    expect(logger.info.mock.calls).toEqual([
      [{ event: 'public_link.created', linkId: link.id, fileId: FILE_ID }],
    ]);
    const written = JSON.stringify([recorded, logger.info.mock.calls]);
    expect(written).not.toContain(token.toString());
    expect(written).not.toContain(PASSWORD);
  });

  it('CA-4, CA-15: si había un enlace sin revocar, `public_link.revoked` (`replaced`) antes de `public_link.created`', async () => {
    const { service, journal, recorded, logger } = setup({
      replaced: { previous: previousLink() },
    });

    const { link } = await service.createLink(ANA, command());

    expect(journal.slice(-4)).toEqual([
      'replace',
      'audit:public_link.revoked',
      'audit:public_link.created',
      'commit',
    ]);
    expect(recorded[0]).toEqual({
      action: AuditAction.PUBLIC_LINK_REVOKED,
      actor: ANA,
      targetUserId: ANA.id,
      resourceId: FILE_ID,
      attributes: { reason: 'replaced' },
    });
    expect(recorded[1]?.attributes).toEqual({ expiresInDays: 7, protection: 'none' });
    expect(logger.info.mock.calls).toEqual([
      [{ event: 'public_link.revoked', linkId: PREVIOUS_ID, fileId: FILE_ID }],
      [{ event: 'public_link.created', linkId: link.id, fileId: FILE_ID }],
    ]);
  });

  it.each([
    ['sin `CREATE_PUBLIC_LINK` (ajeno, Editor o Lector)', { allowed: false }, ['can']],
    ['una carpeta, en la papelera o inexistente', { file: null }, ['can', 'findOwnedFile']],
  ])('CA-3: %s es el 404 de lo inexistente y no escribe', async (_case, options, steps) => {
    const { service, journal, links } = setup(options);

    await expect(service.createLink(ANA, command())).rejects.toBeInstanceOf(NodeNotFoundError);
    expect(journal).toEqual(['rate', `tx:${ANA.id}`, ...steps]);
    expect(links.replace).not.toHaveBeenCalled();
  });

  it('CA-3: si el archivo deja de ser propio y vivo antes del reemplazo, 404 sin auditar (la transacción revierte)', async () => {
    const { service, recorded, logger } = setup({ replaced: null });

    await expect(service.createLink(ANA, command())).rejects.toBeInstanceOf(NodeNotFoundError);
    expect(recorded).toEqual([]);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('CA-5: en solo lectura falla antes de hashear y no escribe', async () => {
    const { service, hasher, links } = setup({ readOnly: true });

    await expect(service.createLink(ANA, command({ password: PASSWORD }))).rejects.toBeInstanceOf(
      ReadOnlyForTest,
    );
    expect(hasher.hash).not.toHaveBeenCalled();
    expect(links.replace).not.toHaveBeenCalled();
  });

  it('CA-6: superado el límite por propietario, 429 con la espera antes de resolver el archivo', async () => {
    const { service, journal, rateLimiter, logger } = setup({
      rate: { allowed: false, retryAfterSeconds: 42 },
    });

    const error = await service.createLink(ANA, command()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RateLimitExceededError);
    expect(error).toMatchObject({ retryAfterSeconds: 42 });
    expect(journal).toEqual(['rate']);
    expect(rateLimiter.consume).toHaveBeenCalledWith(`sharing:link:${ANA.id}`, [
      { limit: RATE_LIMIT_PER_MINUTE, windowSeconds: 60 },
    ]);
    expect(logger.warn).toHaveBeenCalledWith({ event: 'sharing.rate_limited', actorId: ANA.id });
  });
});

describe('PublicLinkService.currentLink (plan 013 §2)', () => {
  it('CA-7: con el actor, `can` y archivo propio y vivo antes de leer el enlace sin revocar del archivo', async () => {
    const { service, journal, permissions, links } = setup({ current: previousLink() });

    await service.currentLink(ANA, FILE_ID);

    expect(journal).toEqual([`tx:${ANA.id}`, 'can', 'findOwnedFile', 'findCurrent', 'commit']);
    expect(permissions.can).toHaveBeenCalledWith(ANA, FILE_ID, Action.CREATE_PUBLIC_LINK);
    expect(links.findCurrent).toHaveBeenCalledWith(ANA, FILE_ID);
  });

  it.each([
    ['vigente', new Date(NOW.getTime() + DAY_MS), 'active'],
    ['vencido', NOW, 'expired'],
  ] as const)(
    'CA-7: un enlace %s sale con su estado, sin token ni URL',
    async (_case, expiresAt, status) => {
      const { service } = setup({ current: previousLink(expiresAt) });

      await expect(service.currentLink(ANA, FILE_ID)).resolves.toEqual({
        id: PREVIOUS_ID,
        fileId: FILE_ID,
        expiresAt,
        hasPassword: false,
        status,
        createdAt: new Date(NOW.getTime() - DAY_MS),
      });
    },
  );

  it('CA-7: sin enlace sin revocar, `null`', async () => {
    const { service } = setup({ current: null });

    await expect(service.currentLink(ANA, FILE_ID)).resolves.toBeNull();
  });

  it.each([
    ['sin `CREATE_PUBLIC_LINK` (ajeno, Editor o Lector)', { allowed: false }],
    ['una carpeta, en la papelera o inexistente', { file: null }],
  ])('CA-7: %s es el 404 de lo inexistente y no lee enlaces', async (_case, options) => {
    const { service, links } = setup(options);

    await expect(service.currentLink(ANA, FILE_ID)).rejects.toBeInstanceOf(NodeNotFoundError);
    expect(links.findCurrent).not.toHaveBeenCalled();
  });
});

describe('PublicLinkService.revokeLink (plan 013 §2)', () => {
  it('CA-8: revoca con el actor y la hora del reloj, sin pasar por la solo lectura ni por el archivo', async () => {
    const { service, journal, links, writable, permissions } = setup();

    await service.revokeLink(ANA, PREVIOUS_ID);

    expect(journal).toEqual([`tx:${ANA.id}`, 'revoke', 'audit:public_link.revoked', 'commit']);
    expect(links.revoke).toHaveBeenCalledWith(ANA, PREVIOUS_ID, NOW);
    expect(writable.assertWritable).not.toHaveBeenCalled();
    expect(permissions.can).not.toHaveBeenCalled();
  });

  it('CA-8, CA-15: `public_link.revoked` con `reason: revoked` en la transacción; la bitácora solo con ids', async () => {
    const { service, recorded, logger } = setup();

    await service.revokeLink(ANA, PREVIOUS_ID);

    expect(recorded).toEqual([
      {
        action: AuditAction.PUBLIC_LINK_REVOKED,
        actor: ANA,
        targetUserId: ANA.id,
        resourceId: FILE_ID,
        attributes: { reason: 'revoked' },
      },
    ]);
    expect(logger.info.mock.calls).toEqual([
      [{ event: 'public_link.revoked', linkId: PREVIOUS_ID, fileId: FILE_ID }],
    ]);
  });

  it('CA-8: ajeno, inexistente o ya revocado es `SHARING_LINK_NOT_FOUND`, sin auditar ni registrar', async () => {
    const { service, recorded, logger } = setup({ revoked: null });

    await expect(service.revokeLink(ANA, PREVIOUS_ID)).rejects.toBeInstanceOf(
      PublicLinkNotFoundError,
    );
    expect(recorded).toEqual([]);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
