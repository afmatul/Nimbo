import type { Actor, IRateLimiter, ITransactionRunner, RateLimitDecision } from '../../../shared';
import { createActor, FixedClock, RateLimitExceededError, Role } from '../../../shared';
import { Action } from '../../access';
import { AuditAction } from '../../audit';
import type { AuditRecord, IAuditLogger } from '../../audit';
import { NodeNotFoundError } from '../../storage';
import {
  CannotShareWithSelfError,
  RecipientNotFoundError,
  ShareNotFoundError,
  SharingInvalidLevelError,
} from '../domain/errors';
import { UserShare } from '../domain/user-share';
import type { SharedNodeRef } from '../domain/user-share';

import type { AccessGrants, IShareRepository } from './ports/i-share.repository.port';
import type { IShareeDirectory, Sharee } from './ports/i-sharee-directory.port';
import { SharingService } from './sharing.service';
import type { ShareCommand } from './sharing.service';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const BRUNO: Sharee = {
  id: '22222222-2222-4222-8222-222222222222',
  displayName: 'Bruno Díaz',
  email: 'bruno@ejemplo.com',
};
const FOLDER: SharedNodeRef = { type: 'folder', id: '33333333-3333-4333-8333-333333333333' };
const NOW = new Date('2026-10-30T10:00:00.000Z');
const RATE_LIMIT_PER_MINUTE = 20;
const PARENT = { id: '55555555-5555-4555-8555-555555555555', name: 'Proyectos' };
const CARLA_ID = '66666666-6666-4666-8666-666666666666';
const GRANTS: AccessGrants = {
  direct: [
    {
      shareId: '44444444-4444-4444-8444-444444444444',
      granteeId: BRUNO.id,
      level: 'EDITOR',
      createdAt: NOW,
    },
  ],
  inherited: [
    { granteeId: BRUNO.id, level: 'VIEWER', createdAt: NOW, folder: PARENT },
    { granteeId: CARLA_ID, level: 'VIEWER', createdAt: NOW, folder: PARENT },
  ],
};

/** Error que el doble de `WritableAccountPolicy` lanza en solo lectura (el real es de `storage`). */
class ReadOnlyForTest extends Error {}

const command = (overrides: Partial<ShareCommand> = {}): ShareCommand => ({
  nodeType: FOLDER.type,
  nodeId: FOLDER.id,
  email: BRUNO.email,
  level: 'VIEWER',
  ...overrides,
});

const existingShare = (level: 'VIEWER' | 'EDITOR'): UserShare =>
  UserShare.rehydrate({
    id: '44444444-4444-4444-8444-444444444444',
    ownerId: ANA.id,
    recipientId: BRUNO.id,
    node: FOLDER,
    level,
    createdAt: new Date('2026-10-01T10:00:00.000Z'),
  });

interface SetupOptions {
  readonly allowed?: boolean;
  readonly recipient?: Sharee | null;
  readonly existing?: UserShare | null;
  readonly readOnly?: boolean;
  readonly rate?: RateLimitDecision;
  readonly inserted?: boolean;
  readonly grants?: AccessGrants | null;
  readonly profiles?: ReadonlyMap<string, Sharee>;
  readonly revoked?: UserShare | null;
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
    run: () => Promise.reject(new Error('compartir corre con el actor')),
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
  const directory: IShareeDirectory = {
    findClientByEmail: jest.fn(
      step('recipient', options.recipient === undefined ? BRUNO : options.recipient),
    ),
    profiles: jest.fn(step('profiles', options.profiles ?? new Map([[BRUNO.id, BRUNO]]))),
    displayNames: jest.fn(),
  };
  const shares: IShareRepository = {
    findDirect: jest.fn(step('findDirect', options.existing ?? null)),
    insert: jest.fn(step('insert', options.inserted ?? true)),
    updateLevel: jest.fn(step('updateLevel', undefined)),
    listAccess: jest.fn(step('listAccess', options.grants === undefined ? GRANTS : options.grants)),
    revoke: jest.fn(
      step('revoke', options.revoked === undefined ? existingShare('EDITOR') : options.revoked),
    ),
    listReceived: jest.fn(),
    findReceived: jest.fn(),
    leave: jest.fn(),
  };
  const writable = {
    assertWritable: jest.fn(() => {
      journal.push('writable');
      return options.readOnly === true ? Promise.reject(new ReadOnlyForTest()) : Promise.resolve();
    }),
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
  const service = new SharingService(
    transactions,
    permissions,
    shares,
    directory,
    writable,
    rateLimiter,
    audit,
    new FixedClock(NOW),
    { shareAttemptsPerMinute: RATE_LIMIT_PER_MINUTE },
    logger,
  );
  return { service, journal, recorded, shares, rateLimiter, permissions, logger };
};

describe('SharingService.share (plan 012 §5)', () => {
  it('CA-1: límite → permiso SHARE → destinatario → existente → solo lectura → alta y auditoría en la transacción', async () => {
    const { service, journal, permissions } = setup();

    const outcome = await service.share(ANA, command());

    expect(journal).toEqual([
      'rate',
      `tx:${ANA.id}`,
      'can',
      'recipient',
      'findDirect',
      'writable',
      'insert',
      'audit:share.granted',
      'commit',
    ]);
    expect(permissions.can).toHaveBeenCalledWith(ANA, FOLDER.id, Action.SHARE);
    expect(outcome.change).toBe('granted');
    expect(outcome.access).toEqual({
      shareId: expect.any(String) as string,
      grantee: BRUNO,
      level: 'VIEWER',
      createdAt: NOW,
    });
  });

  it('CA-19: el evento va a la actividad de la propietaria con tipo de nodo y nivel, sin correo ni nombre', async () => {
    const { service, recorded, logger } = setup();

    const { access } = await service.share(ANA, command({ level: 'EDITOR' }));

    expect(recorded).toEqual([
      {
        action: AuditAction.SHARE_GRANTED,
        actor: ANA,
        targetUserId: ANA.id,
        resourceId: FOLDER.id,
        attributes: { nodeType: 'folder', level: 'EDITOR' },
      },
    ]);
    expect(logger.info).toHaveBeenCalledWith({
      event: 'sharing.granted',
      shareId: access.shareId,
      nodeId: FOLDER.id,
      level: 'EDITOR',
    });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(BRUNO.email);
  });

  it('CA-7: superado el límite, 429 antes de abrir la transacción y sin buscar el correo', async () => {
    const { service, journal, rateLimiter } = setup({
      rate: { allowed: false, retryAfterSeconds: 42 },
    });

    await expect(service.share(ANA, command())).rejects.toMatchObject({
      constructor: RateLimitExceededError,
      retryAfterSeconds: 42,
    });
    expect(journal).toEqual(['rate']);
    expect(rateLimiter.consume).toHaveBeenCalledWith(`sharing:share:${ANA.id}`, [
      { limit: RATE_LIMIT_PER_MINUTE, windowSeconds: 60 },
    ]);
  });

  it('CA-4: sin permiso SHARE (ajeno, inexistente, papelera o Editor/Lector), 404 de nodo sin buscar el correo', async () => {
    const { service, journal } = setup({ allowed: false });

    await expect(service.share(ANA, command())).rejects.toBeInstanceOf(NodeNotFoundError);
    expect(journal).not.toContain('recipient');
  });

  it('CA-4: un `nodeType` que no es el del nodo no escribe nada y es el mismo 404', async () => {
    const { service, recorded } = setup({ inserted: false });

    await expect(service.share(ANA, command({ nodeType: 'file' }))).rejects.toBeInstanceOf(
      NodeNotFoundError,
    );
    expect(recorded).toEqual([]);
  });

  it('CA-3: sin cliente verificado y activo, 422 único antes de mirar la solo lectura ni escribir', async () => {
    const { service, journal } = setup({ recipient: null, readOnly: true });

    await expect(service.share(ANA, command())).rejects.toBeInstanceOf(RecipientNotFoundError);
    expect(journal).toEqual(['rate', `tx:${ANA.id}`, 'can', 'recipient']);
  });

  it('CA-3: con su propio correo, 422 `SHARING_CANNOT_SHARE_WITH_SELF` y nada se escribe', async () => {
    const self: Sharee = { id: ANA.id, displayName: 'Ana', email: 'ana@ejemplo.com' };
    const { service, shares } = setup({ recipient: self });

    await expect(service.share(ANA, command({ email: self.email }))).rejects.toBeInstanceOf(
      CannotShareWithSelfError,
    );
    expect(shares.insert).not.toHaveBeenCalled();
  });

  it('CA-2: `OWNER` es 422 `SHARING_INVALID_LEVEL` también al cambiar un acceso existente', async () => {
    const { service, shares } = setup({ existing: existingShare('VIEWER') });

    await expect(service.share(ANA, command({ level: 'OWNER' }))).rejects.toBeInstanceOf(
      SharingInvalidLevelError,
    );
    expect(shares.updateLevel).not.toHaveBeenCalled();
  });

  it('CA-5: con otro nivel cambia el existente sin duplicar y audita el cambio', async () => {
    const { service, journal, recorded } = setup({ existing: existingShare('EDITOR') });

    const outcome = await service.share(ANA, command({ level: 'VIEWER' }));

    expect(outcome.change).toBe('level_changed');
    expect(outcome.access).toMatchObject({ shareId: existingShare('EDITOR').id, level: 'VIEWER' });
    expect(journal).not.toContain('insert');
    expect(journal).toContain('updateLevel');
    expect(recorded.map((entry) => [entry.action, entry.attributes])).toEqual([
      [AuditAction.SHARE_LEVEL_CHANGED, { nodeType: 'folder', level: 'VIEWER' }],
    ]);
  });

  it('CA-5: con el mismo nivel responde el acceso sin escribir ni auditar', async () => {
    const { service, journal, recorded } = setup({ existing: existingShare('VIEWER') });

    const outcome = await service.share(ANA, command({ level: 'VIEWER' }));

    expect(outcome.change).toBe('unchanged');
    expect(journal).not.toContain('updateLevel');
    expect(recorded).toEqual([]);
  });

  it.each([
    ['comparte con alguien nuevo', null, 'VIEWER'],
    ['sube de VIEWER a EDITOR', existingShare('VIEWER'), 'EDITOR'],
  ] as const)(
    'CA-6: en solo lectura, %s es el error de solo lectura y nada cambia',
    async (_, existing, level) => {
      const { service, shares, recorded } = setup({ existing, readOnly: true });

      await expect(service.share(ANA, command({ level }))).rejects.toBeInstanceOf(ReadOnlyForTest);
      expect(shares.insert).not.toHaveBeenCalled();
      expect(shares.updateLevel).not.toHaveBeenCalled();
      expect(recorded).toEqual([]);
    },
  );

  it('CA-6: en solo lectura, bajar de EDITOR a VIEWER se permite', async () => {
    const { service, journal } = setup({ existing: existingShare('EDITOR'), readOnly: true });

    const outcome = await service.share(ANA, command({ level: 'VIEWER' }));

    expect(outcome.change).toBe('level_changed');
    expect(journal).not.toContain('writable');
  });
});

describe('SharingService.listAccess (plan 012 §2)', () => {
  it('CA-8: con `VIEW_ACCESS_LIST`, directos y heredados con el perfil de cada persona; sin perfil, se omite', async () => {
    const { service, journal, permissions } = setup();

    const list = await service.listAccess(ANA, FOLDER);

    expect(permissions.can).toHaveBeenCalledWith(ANA, FOLDER.id, Action.VIEW_ACCESS_LIST);
    expect(journal).toEqual([`tx:${ANA.id}`, 'can', 'listAccess', 'profiles', 'commit']);
    expect(list.entries()).toEqual([
      {
        origin: 'direct',
        shareId: '44444444-4444-4444-8444-444444444444',
        grantee: BRUNO,
        level: 'EDITOR',
        createdAt: NOW,
      },
      { origin: 'inherited', grantee: BRUNO, level: 'VIEWER', createdAt: NOW, folder: PARENT },
    ]);
  });

  it('CA-9: sin el permiso (ajeno, inexistente, Editor o Lector), 404 de nodo sin leer accesos', async () => {
    const { service, journal } = setup({ allowed: false });

    await expect(service.listAccess(ANA, FOLDER)).rejects.toBeInstanceOf(NodeNotFoundError);
    expect(journal).not.toContain('listAccess');
  });

  it('CA-9: si no hay un nodo de ese tipo, el mismo 404', async () => {
    const { service } = setup({ grants: null });

    await expect(service.listAccess(ANA, { ...FOLDER, type: 'file' })).rejects.toBeInstanceOf(
      NodeNotFoundError,
    );
  });
});

describe('SharingService.revoke (plan 012 §2)', () => {
  const SHARE_ID = '44444444-4444-4444-8444-444444444444';

  it('CA-10, CA-19: borra como propietaria y audita `share.revoked` en la transacción, sin mirar la solo lectura', async () => {
    const { service, journal, recorded, shares, logger } = setup({ readOnly: true });

    await service.revoke(ANA, SHARE_ID);

    expect(shares.revoke).toHaveBeenCalledWith(ANA, SHARE_ID);
    expect(journal).toEqual([`tx:${ANA.id}`, 'revoke', 'audit:share.revoked', 'commit']);
    expect(recorded).toEqual([
      {
        action: AuditAction.SHARE_REVOKED,
        actor: ANA,
        targetUserId: ANA.id,
        resourceId: FOLDER.id,
        attributes: { nodeType: 'folder', level: 'EDITOR' },
      },
    ]);
    expect(logger.info).toHaveBeenCalledWith({
      event: 'sharing.revoked',
      shareId: SHARE_ID,
      nodeId: FOLDER.id,
      level: 'EDITOR',
    });
  });

  it('CA-11: ajeno, inexistente o ya revocado es 404 `SHARING_SHARE_NOT_FOUND` sin auditar ni registrar', async () => {
    const { service, recorded, logger } = setup({ revoked: null });

    await expect(service.revoke(ANA, SHARE_ID)).rejects.toBeInstanceOf(ShareNotFoundError);
    expect(recorded).toEqual([]);
    expect(logger.info).not.toHaveBeenCalled();
  });
});
