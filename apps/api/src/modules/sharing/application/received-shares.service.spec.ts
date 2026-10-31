import type { ITransactionRunner } from '../../../shared';
import { createActor, Role } from '../../../shared';
import type { IAuditLogger } from '../../audit';
import { ShareNotFoundError } from '../domain/errors';
import { UserShare } from '../domain/user-share';

import type { IShareRepository, ReceivedGrant } from './ports/i-share.repository.port';
import type { IShareeDirectory } from './ports/i-sharee-directory.port';
import { ReceivedSharesService } from './received-shares.service';

const BRUNO = createActor('22222222-2222-4222-8222-222222222222', Role.CLIENT);
const ANA_ID = '11111111-1111-4111-8111-111111111111';
const GHOST_ID = '99999999-9999-4999-8999-999999999999';
const NOW = new Date('2026-10-30T10:00:00.000Z');

const grant = (shareId: string, ownerId: string): ReceivedGrant => ({
  shareId,
  node: { type: 'folder', id: '33333333-3333-4333-8333-333333333333' },
  name: 'Proyectos',
  ownerId,
  level: 'VIEWER',
  createdAt: NOW,
});

const SHARE_ID = '44444444-4444-4444-8444-444444444444';

const received = (): UserShare =>
  UserShare.rehydrate({
    id: SHARE_ID,
    ownerId: ANA_ID,
    recipientId: BRUNO.id,
    node: { type: 'file', id: '55555555-5555-4555-8555-555555555555' },
    level: 'EDITOR',
    createdAt: NOW,
  });

interface LeaveScenario {
  readonly found?: UserShare | null;
  readonly deleted?: UserShare | null;
}

const setup = (grants: ReceivedGrant[], leave: LeaveScenario = {}) => {
  const journal: string[] = [];
  const transactions: ITransactionRunner = {
    run: () => Promise.reject(new Error('lo recibido corre con el actor')),
    withActor: async (actor, work) => {
      journal.push(`tx:${actor.id}`);
      const result = await work();
      journal.push('commit');
      return result;
    },
  };
  const shares = {
    listReceived: jest.fn(() => {
      journal.push('listReceived');
      return Promise.resolve(grants);
    }),
    findReceived: jest.fn(() => {
      journal.push('findReceived');
      return Promise.resolve(leave.found ?? null);
    }),
    leave: jest.fn(() => {
      journal.push('leave');
      return Promise.resolve(leave.deleted === undefined ? leave.found : leave.deleted);
    }),
  } as unknown as IShareRepository;
  const audit = {
    recordInTransaction: jest.fn(() => {
      journal.push('audit');
      return Promise.resolve();
    }),
  } as unknown as IAuditLogger;
  const logger = { info: jest.fn(() => journal.push('log')), warn: jest.fn() };
  const directory = {
    displayNames: jest.fn(() => {
      journal.push('displayNames');
      return Promise.resolve(new Map([[ANA_ID, 'Ana López']]));
    }),
  } as unknown as IShareeDirectory;
  return {
    service: new ReceivedSharesService(transactions, shares, directory, audit, logger),
    journal,
    directory,
    audit,
    logger,
  };
};

describe('ReceivedSharesService.listReceived (plan 012 §2)', () => {
  it('CA-22: en el orden del repositorio, con el nombre visible de cada propietario pedido una vez', async () => {
    const { service, journal, directory } = setup([grant('a', ANA_ID), grant('b', ANA_ID)]);

    const views = await service.listReceived(BRUNO);

    expect(journal).toEqual([`tx:${BRUNO.id}`, 'listReceived', 'displayNames', 'commit']);
    expect(directory.displayNames).toHaveBeenCalledWith([ANA_ID]);
    expect(views.map((view) => [view.shareId, view.owner.displayName])).toEqual([
      ['a', 'Ana López'],
      ['b', 'Ana López'],
    ]);
    expect(views[0]).not.toHaveProperty('ownerId');
  });

  it('CA-22: un acceso cuyo propietario no tiene nombre se omite', async () => {
    const { service } = setup([grant('a', GHOST_ID), grant('b', ANA_ID)]);

    const views = await service.listReceived(BRUNO);

    expect(views.map((view) => view.shareId)).toEqual(['b']);
  });
});

describe('ReceivedSharesService.leave (plan 012 §2)', () => {
  it('CA-23: audita `share.revoked` en la actividad del propietario antes de borrar y registra solo ids y nivel', async () => {
    const { service, journal, audit, logger } = setup([], { found: received() });

    await service.leave(BRUNO, SHARE_ID);

    expect(journal).toEqual([`tx:${BRUNO.id}`, 'findReceived', 'audit', 'leave', 'commit', 'log']);
    expect(audit.recordInTransaction).toHaveBeenCalledWith({
      action: 'share.revoked',
      actor: BRUNO,
      targetUserId: ANA_ID,
      resourceId: '55555555-5555-4555-8555-555555555555',
      attributes: { nodeType: 'file', level: 'EDITOR' },
    });
    expect(logger.info).toHaveBeenCalledWith({
      event: 'sharing.revoked',
      shareId: SHARE_ID,
      nodeId: '55555555-5555-4555-8555-555555555555',
      level: 'EDITOR',
    });
  });

  it('CA-23: un acceso ajeno, inexistente o ya usado es `ShareNotFoundError` sin auditar ni borrar', async () => {
    const { service, journal } = setup([], { found: null });

    await expect(service.leave(BRUNO, SHARE_ID)).rejects.toBeInstanceOf(ShareNotFoundError);
    expect(journal).toEqual([`tx:${BRUNO.id}`, 'findReceived']);
  });

  it('CA-23: si otra petición lo borró entre la lectura y el borrado, falla y la transacción no se confirma', async () => {
    const { service, journal } = setup([], { found: received(), deleted: null });

    await expect(service.leave(BRUNO, SHARE_ID)).rejects.toBeInstanceOf(ShareNotFoundError);
    expect(journal).not.toContain('commit');
  });
});
