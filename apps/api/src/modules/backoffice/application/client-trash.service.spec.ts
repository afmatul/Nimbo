import { randomUUID } from 'node:crypto';

import { BACKOFFICE_ERROR_CODES } from '@nimbo/contracts';

import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import type { AuditRecord } from '../../audit';
import type { ClientIdentity } from '../../identity';
import { InvalidQueryError, NodeNotFoundError } from '../../storage';
import type { SupportRestoreView, SupportTrashPage } from '../../storage';

import { ClientTrashService } from './client-trash.service';
import type { InternalAction } from './internal-action.service';

const CLIENT: ClientIdentity = { id: randomUUID(), fullName: 'Ana López', email: 'ana@nimbo.me' };
const NODE_ID = randomUUID();
const NOTE = 'La clienta pidió recuperarlo por teléfono';
const EMPTY_PAGE: SupportTrashPage = { items: [], nextCursor: null };

const RESTORED: SupportRestoreView = {
  item: {} as SupportRestoreView['item'],
  outcome: 'renamed',
  originalName: 'informe.docx',
  itemCount: 3,
  sizeBytes: 3_221_225_472n,
};

interface SetupOptions {
  /** `null` = correo inexistente o de una cuenta interna (003 D-6). */
  readonly client?: ClientIdentity | null;
  readonly listFailure?: Error;
  readonly restoreFailure?: Error;
}

const settle = <T>(value: T, failure: Error | undefined): Promise<T> =>
  failure === undefined ? Promise.resolve(value) : Promise.reject(failure);

/** `InternalActionService` en memoria: el evento solo se guarda si la acción termina (misma transacción). */
const setup = (options: SetupOptions = {}) => {
  const recorded: AuditRecord[] = [];
  const logs: Record<string, unknown>[] = [];
  const internal = {
    run: async <T>(_actor: Actor, action: InternalAction<T>): Promise<T> => {
      const result = await action.work();
      recorded.push(...[action.event(result)].flat());
      return result;
    },
  };
  const directory = {
    findClientByEmail: jest.fn(() =>
      Promise.resolve(options.client === undefined ? CLIENT : options.client),
    ),
  };
  const trash = {
    list: jest.fn(() => settle(EMPTY_PAGE, options.listFailure)),
    restore: jest.fn(() => settle(RESTORED, options.restoreFailure)),
  };
  const logger = {
    info: (payload: Record<string, unknown>): void => {
      logs.push(payload);
    },
  };
  const service = new ClientTrashService(internal, directory, trash, logger);
  return { recorded, logs, trash, service, actor: createActor(randomUUID(), Role.SUPPORT) };
};

const restoreCmd = {
  email: CLIENT.email,
  note: NOTE,
  item: { type: 'folder' as const, id: NODE_ID },
};

describe('ClientTrashService.list (011b CA-10, CA-12)', () => {
  it('CA-10: lee la papelera del cliente encontrado y audita la consulta contra su cuenta', async () => {
    const { service, trash, recorded, actor } = setup();

    const view = await service.list(actor, { email: CLIENT.email, cursor: 'c1', limit: 20 });

    expect(trash.list).toHaveBeenCalledWith(actor, {
      ownerId: CLIENT.id,
      cursor: 'c1',
      limit: 20,
    });
    expect(view).toEqual({ client: CLIENT, page: EMPTY_PAGE });
    expect(recorded).toEqual([
      { action: 'client.files_viewed', actor, targetUserId: CLIENT.id, resourceId: CLIENT.id },
    ]);
  });

  it('sin cursor no pasa la clave `cursor`', async () => {
    const { service, trash, actor } = setup();

    await service.list(actor, { email: CLIENT.email, cursor: undefined, limit: 50 });

    expect(trash.list).toHaveBeenCalledWith(actor, { ownerId: CLIENT.id, limit: 50 });
  });

  it('CA-12: un cursor que la papelera no emitió es `400 BACKOFFICE_INVALID_QUERY`, sin evento', async () => {
    const listFailure = new InvalidQueryError([
      { field: 'cursor', reason: 'INVALID_CURSOR', message: 'x' },
    ]);
    const { service, recorded, actor } = setup({ listFailure });

    await expect(
      service.list(actor, { email: CLIENT.email, cursor: 'roto', limit: 50 }),
    ).rejects.toMatchObject({
      status: 400,
      code: BACKOFFICE_ERROR_CODES.INVALID_QUERY,
      fields: [expect.objectContaining({ field: 'cursor', reason: 'INVALID_CURSOR' })],
    });
    expect(recorded).toEqual([]);
  });

  it('CA-12: un correo que no es de un cliente es `404` sin leer `storage` ni auditar; la bitácora no lleva el correo', async () => {
    const { service, trash, recorded, logs, actor } = setup({ client: null });

    await expect(
      service.list(actor, { email: 'nadie@nimbo.me', cursor: undefined, limit: 50 }),
    ).rejects.toMatchObject({ status: 404, code: BACKOFFICE_ERROR_CODES.CLIENT_NOT_FOUND });
    expect(trash.list).not.toHaveBeenCalled();
    expect(recorded).toEqual([]);
    expect(logs).toEqual([
      { event: 'backoffice.client_trash.not_found', actorId: actor.id, actorRole: Role.SUPPORT },
    ]);
  });

  it('RNF-17: la bitácora `backoffice.client_trash.viewed` lleva solo ids', async () => {
    const { service, logs, actor } = setup();

    await service.list(actor, { email: CLIENT.email, cursor: undefined, limit: 50 });

    expect(logs).toEqual([
      { event: 'backoffice.client_trash.viewed', actorId: actor.id, clientId: CLIENT.id },
    ]);
  });
});

describe('ClientTrashService.restore (011b CA-11, CA-12, CA-14)', () => {
  it('CA-11: restaura la raíz del cliente encontrado y devuelve el resultado de `storage`', async () => {
    const { service, trash, actor } = setup();

    await expect(service.restore(actor, restoreCmd)).resolves.toBe(RESTORED);
    expect(trash.restore).toHaveBeenCalledWith(actor, {
      ownerId: CLIENT.id,
      item: { type: 'folder', id: NODE_ID },
    });
  });

  it('CA-14, RN-4: `node.restored` contra el cliente con el motivo, la cantidad y los bytes', async () => {
    const { service, recorded, actor } = setup();

    await service.restore(actor, restoreCmd);

    expect(recorded).toEqual([
      {
        action: 'node.restored',
        actor,
        targetUserId: CLIENT.id,
        resourceId: NODE_ID,
        attributes: { nodeType: 'folder', itemCount: 3, sizeBytes: 3_221_225_472, note: NOTE },
      },
    ]);
  });

  it('CA-14, RNF-17: la bitácora lleva ids y el resultado, nunca el motivo, el nombre ni el correo', async () => {
    const { service, logs, actor } = setup();

    await service.restore(actor, restoreCmd);

    expect(logs).toEqual([
      {
        event: 'backoffice.client_trash.restored',
        actorId: actor.id,
        clientId: CLIENT.id,
        nodeId: NODE_ID,
        outcome: 'renamed',
      },
    ]);
    expect(JSON.stringify(logs)).not.toMatch(/teléfono|informe|ana@nimbo|Ana López/);
  });

  it('CA-12: un correo que no es de un cliente es `404` sin tocar `storage` ni guardar el motivo', async () => {
    const { service, trash, recorded, actor } = setup({ client: null });

    await expect(service.restore(actor, restoreCmd)).rejects.toMatchObject({
      status: 404,
      code: BACKOFFICE_ERROR_CODES.CLIENT_NOT_FOUND,
    });
    expect(trash.restore).not.toHaveBeenCalled();
    expect(recorded).toEqual([]);
  });

  it('CA-12: si `storage` rechaza (no es raíz, ajena o vencida) el error sube y el motivo no se guarda', async () => {
    const { service, recorded, logs, actor } = setup({ restoreFailure: new NodeNotFoundError() });

    await expect(service.restore(actor, restoreCmd)).rejects.toBeInstanceOf(NodeNotFoundError);
    expect(recorded).toEqual([]);
    expect(logs).toEqual([]);
  });
});
