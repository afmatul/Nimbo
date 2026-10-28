import { randomUUID } from 'node:crypto';

import { BACKOFFICE_ERROR_CODES, BACKOFFICE_PAGE_SIZE } from '@nimbo/contracts';

import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import type { AuditRecord } from '../../audit';
import type { ClientIdentity } from '../../identity';
import type { FileMetadata, FileMetadataPage } from '../../storage';

import type { InternalAction } from './internal-action.service';
import { SupportService } from './support.service';

const CLIENT: ClientIdentity = { id: randomUUID(), fullName: 'Ana López', email: 'ana@nimbo.me' };
const AT = new Date('2026-10-07T12:00:00.000Z');

const aFile = (trashedAt: Date | null): FileMetadata => ({
  id: randomUUID(),
  name: 'informe.docx',
  kind: 'docx',
  sizeBytes: 3_221_225_472n,
  createdAt: AT,
  updatedAt: AT,
  trashedAt,
});

interface SetupOptions {
  /** Lo que `AccountDirectory.findClientByEmail` devuelve: `null` = inexistente o interna (003 D-6). */
  readonly client?: ClientIdentity | null;
  readonly files?: FileMetadataPage;
}

/**
 * `InternalActionService` en memoria: hace la acción y, solo si termina, arma y guarda su evento; si la acción lanza,
 * la «transacción» se revierte sin evento. Sus garantías reales (actor activo, misma transacción) las prueba su spec.
 */
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
  const reader = {
    listForOwner: jest.fn(() => Promise.resolve(options.files ?? { items: [], total: 0 })),
  };
  const logger = {
    info: (payload: Record<string, unknown>): void => {
      logs.push(payload);
    },
  };
  const service = new SupportService(internal, directory, reader, logger);
  return { recorded, logs, reader, service, actor: createActor(randomUUID(), Role.SUPPORT) };
};

describe('SupportService (011 CA-13, RN-2)', () => {
  it('CA-13: busca al cliente por correo y devuelve una página de sus metadatos, papelera incluida', async () => {
    const files = { items: [aFile(null), aFile(AT)], total: 12 };
    const { service, reader, actor } = setup({ files });

    const result = await service.listClientFiles(actor, { email: CLIENT.email, page: 2 });

    expect(reader.listForOwner).toHaveBeenCalledWith(actor, CLIENT.id, {
      page: 2,
      pageSize: BACKOFFICE_PAGE_SIZE,
    });
    expect(result).toEqual({
      client: CLIENT,
      items: files.items,
      page: 2,
      total: 12,
    });
  });

  it('RN-2: audita la consulta sobre la cuenta del cliente aunque la página venga vacía', async () => {
    const { service, recorded, actor } = setup();

    await service.listClientFiles(actor, { email: CLIENT.email, page: 1 });

    expect(recorded).toEqual([
      {
        action: 'client.files_viewed',
        actor,
        targetUserId: CLIENT.id,
        resourceId: CLIENT.id,
      },
    ]);
  });

  it('CA-13: un correo inexistente o de una cuenta interna da `404 BACKOFFICE_CLIENT_NOT_FOUND`, sin evento de auditoría ni lectura', async () => {
    const { service, recorded, reader, actor } = setup({ client: null });

    await expect(
      service.listClientFiles(actor, { email: 'nadie@nimbo.me', page: 1 }),
    ).rejects.toMatchObject({ status: 404, code: BACKOFFICE_ERROR_CODES.CLIENT_NOT_FOUND });
    expect(recorded).toEqual([]);
    expect(reader.listForOwner).not.toHaveBeenCalled();
  });

  it('RNF-17: un `404` deja la bitácora `backoffice.client_files.not_found` con el actor, nunca el correo', async () => {
    const { service, logs, actor } = setup({ client: null });

    await expect(
      service.listClientFiles(actor, { email: 'nadie@nimbo.me', page: 1 }),
    ).rejects.toMatchObject({ status: 404 });

    expect(logs).toEqual([
      { event: 'backoffice.client_files.not_found', actorId: actor.id, actorRole: Role.SUPPORT },
    ]);
    expect(JSON.stringify(logs)).not.toContain('nadie');
  });

  it('RNF-17: la bitácora `backoffice.client_files.viewed` lleva solo ids, nunca el correo ni nombres de archivo', async () => {
    const { service, logs, actor } = setup({ files: { items: [aFile(null)], total: 1 } });

    await service.listClientFiles(actor, { email: CLIENT.email, page: 1 });

    expect(logs).toEqual([
      { event: 'backoffice.client_files.viewed', actorId: actor.id, clientId: CLIENT.id },
    ]);
    expect(JSON.stringify(logs)).not.toMatch(/ana@nimbo\.me|Ana López|informe\.docx/);
  });
});
