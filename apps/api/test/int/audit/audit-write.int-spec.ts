import { randomUUID } from 'node:crypto';

import { completeUploadResponseSchema, initUploadResponseSchema } from '@nimbo/contracts';
import type { DataSource } from 'typeorm';

import { AuditAction } from '../../../src/modules/audit';
import type { AuditRecord } from '../../../src/modules/audit';
import { AuditService } from '../../../src/modules/audit/application/audit.service';
import { UnknownAuditActionError } from '../../../src/modules/audit/application/unknown-audit-action.error';
import { TypeOrmAuditRepository } from '../../../src/modules/audit/infrastructure/persistence/typeorm-audit.repository';
import type { Actor } from '../../../src/shared';
import { CorrelationContext, createActor, Role, SystemClock } from '../../../src/shared';
import { connectAsOwner } from '../../support/database-urls';
import { createStorageHttpApp, textBytes, uploadBytes } from '../storage/storage-http';
import type { InitBody, StorageClient, StorageHttpApp } from '../storage/storage-http';
import type { AppDatabase } from '../storage/storage-test-db';
import {
  connectAsAppDatabase,
  insertAccount,
  insertFolder,
  removeAccounts,
} from '../storage/storage-test-db';

/** Fila de `evento_auditoria` vista por el dueño (sin RLS). */
interface EventRow {
  readonly accion: string;
  readonly actor_id: string | null;
  readonly rol_actor: string;
  readonly usuario_afectado_id: string;
  readonly tipo_recurso: string | null;
  readonly recurso_id: string | null;
  readonly atributos: Record<string, unknown>;
  readonly correlation_id: string | null;
}

const eventsOf = (owner: DataSource, targetUserId: string): Promise<EventRow[]> =>
  owner.query(
    `SELECT accion, actor_id, rol_actor, usuario_afectado_id, tipo_recurso, recurso_id, atributos, correlation_id
       FROM evento_auditoria WHERE usuario_afectado_id = $1 ORDER BY ocurrido_en, id`,
    [targetUserId],
  );

const countWhere = async (owner: DataSource, sql: string, id: string): Promise<number> => {
  const rows = (await owner.query(sql, [id])) as { total: string }[];
  return Number(rows[0]?.total);
};

const folderCount = (owner: DataSource, id: string): Promise<number> =>
  countWhere(owner, 'SELECT count(*) AS total FROM carpeta WHERE id = $1', id);

const eventCount = (owner: DataSource, resourceId: string): Promise<number> =>
  countWhere(
    owner,
    'SELECT count(*) AS total FROM evento_auditoria WHERE recurso_id = $1',
    resourceId,
  );

const buildService = (app: AppDatabase) => {
  const logger = { info: jest.fn(), error: jest.fn() };
  const service = new AuditService(
    new TypeOrmAuditRepository(app.context),
    app.runner,
    new SystemClock(),
    logger as never,
  );
  return { service, logger };
};

/**
 * Escritura de `AuditService` como `nimbo_app` (spec 004 CA-1, CA-2, CA-5; plan §2 «Contrato de escritura»): `record`
 * guarda y nunca lanza; `recordInTransaction` se une al `withActor` de un caso de uso de prueba y comparte su suerte.
 */
describe('AuditService contra Postgres (CA-1, CA-5)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let audit: ReturnType<typeof buildService>;
  let ana: Actor;
  let bruno: Actor;
  const created: string[] = [];

  const trashed = (actor: Actor, folderId: string, targetUserId = actor.id): AuditRecord => ({
    action: AuditAction.NODE_TRASHED,
    actor,
    targetUserId,
    resourceId: folderId,
    attributes: { nodeType: 'folder', itemCount: 1, sizeBytes: 0 },
  });

  /** Caso de uso de prueba: crea una carpeta y registra su evento en la misma transacción; `fail` lo hace fallar al final. */
  const createFolderAudited = (
    actor: Actor,
    record: (folderId: string) => AuditRecord,
    fail = false,
  ) => {
    const folderId = { value: '' };
    const work = app.runner.withActor(actor, async () => {
      const folder = await insertFolder(app.context.requireActorScope(actor), actor.id);
      folderId.value = folder.id;
      await audit.service.recordInTransaction(record(folder.id));
      if (fail) throw new Error('el caso de uso falla después de auditar');
    });
    return { work, folderId };
  };

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    audit = buildService(app);
    const ids = await owner.transaction(async (manager) => [
      await insertAccount(manager),
      await insertAccount(manager),
    ]);
    created.push(...ids);
    ana = createActor(ids[0] as string, Role.CLIENT);
    bruno = createActor(ids[1] as string, Role.CLIENT);
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner.destroy();
  });

  it('CA-1: `record` guarda acción, actor, rol, afectado, recurso, atributos y `correlationId`', async () => {
    const resourceId = randomUUID();

    await CorrelationContext.run({ correlationId: 'corr-audit-write' }, () =>
      audit.service.record(trashed(ana, resourceId)),
    );

    const rows = (await eventsOf(owner, ana.id)).filter((row) => row.recurso_id === resourceId);
    expect(rows).toEqual([
      {
        accion: 'node.trashed',
        actor_id: ana.id,
        rol_actor: 'CLIENT',
        usuario_afectado_id: ana.id,
        tipo_recurso: 'folder',
        recurso_id: resourceId,
        atributos: { nodeType: 'folder', itemCount: 1, sizeBytes: 0 },
        correlation_id: 'corr-audit-write',
      },
    ]);
  });

  it('CA-5: dentro de `withActor`, la operación y el evento se confirman juntos', async () => {
    const { work, folderId } = createFolderAudited(ana, (id) => trashed(ana, id));

    await work;

    await expect(folderCount(owner, folderId.value)).resolves.toBe(1);
    await expect(eventCount(owner, folderId.value)).resolves.toBe(1);
  });

  it('CA-5: si el caso de uso falla después de `recordInTransaction`, no queda ni la operación ni el evento', async () => {
    const { work, folderId } = createFolderAudited(ana, (id) => trashed(ana, id), true);

    await expect(work).rejects.toThrow('el caso de uso falla después de auditar');

    await expect(folderCount(owner, folderId.value)).resolves.toBe(0);
    await expect(eventCount(owner, folderId.value)).resolves.toBe(0);
  });

  it('CA-3, CA-5: una acción fuera del catálogo lanza y revierte la operación del llamador', async () => {
    const unknown = (id: string): AuditRecord => ({
      ...trashed(ana, id),
      action: 'node.vanished' as AuditAction,
    });
    const { work, folderId } = createFolderAudited(ana, unknown);

    await expect(work).rejects.toBeInstanceOf(UnknownAuditActionError);

    await expect(folderCount(owner, folderId.value)).resolves.toBe(0);
  });

  it('CA-5: si la base rechaza el evento (RLS), `recordInTransaction` lanza y la operación se revierte', async () => {
    const { work, folderId } = createFolderAudited(ana, (id) => trashed(ana, id, bruno.id));

    await expect(work).rejects.toThrow(/row-level security/);

    await expect(folderCount(owner, folderId.value)).resolves.toBe(0);
    await expect(eventCount(owner, folderId.value)).resolves.toBe(0);
  });

  it('CA-5: con la base caída, `record` no lanza y anota `audit.record_failed`', async () => {
    const down = await connectAsAppDatabase();
    await down.dataSource.destroy();
    const { service, logger } = buildService(down);

    await expect(service.record(trashed(ana, randomUUID()))).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'audit.record_failed',
        action: 'node.trashed',
        reason: 'write_failed',
      }),
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});

/** Los consumidores de 005 y 006, sin cambios, con `AuditService` real detrás de `I_AUDIT_LOGGER` (CA-2). */
describe('eventos de 005 y 006 guardados (CA-2)', () => {
  let storage: StorageHttpApp;

  beforeAll(async () => {
    storage = await createStorageHttpApp();
  });

  afterAll(async () => {
    await storage?.close();
  });

  /** Carga cuyo contenido (texto) no es el que dice su extensión: 005 la rechaza con `tipo_invalido`. */
  const rejectedUpload = async (client: StorageClient): Promise<string> => {
    const bytes = textBytes(1024);
    const started = await client.init({ name: 'factura-ca2.pdf', sizeBytes: bytes.length });
    const init = initUploadResponseSchema.parse(started.body) as InitBody;
    await uploadBytes(init, bytes);
    expect((await client.complete(init.uploadId)).status).toBe(422);
    return init.uploadId;
  };

  const newFolderId = async (client: StorageClient, name: string): Promise<string> =>
    ((await client.createFolder({ name, parentId: null })).body as { id: string }).id;

  it('CA-2: carga, URL de descarga, papelera y purga quedan en `evento_auditoria` a nombre del cliente', async () => {
    const client = await storage.newClient();
    const uploaded = await client.upload('informe-ca2.txt', textBytes(1024));
    const fileId = completeUploadResponseSchema.parse(uploaded.body).file.id;
    await client.downloadUrl(fileId);
    const folder = (await client.createFolder({ name: 'Proyectos', parentId: null })).body as {
      id: string;
    };
    await client.trashFolder(folder.id);
    await client.purgeFolder(folder.id);

    const rows = await eventsOf(storage.owner, client.id);

    expect(rows.map((row) => [row.accion, row.tipo_recurso, row.recurso_id])).toEqual([
      ['file.upload_completed', 'file', fileId],
      ['file.download_url_issued', 'file', fileId],
      ['node.trashed', 'folder', folder.id],
      ['node.purged', 'folder', folder.id],
    ]);
    expect(rows.every((row) => row.actor_id === client.id && row.correlation_id !== null)).toBe(
      true,
    );
  });

  it('CA-2: carga rechazada, restauración y vaciado de la papelera quedan en `evento_auditoria`', async () => {
    const client = await storage.newClient();
    const uploadId = await rejectedUpload(client);
    const folderId = await newFolderId(client, 'Archivo');
    await client.trashFolder(folderId);
    await client.restoreFolder(folderId);
    await client.trashFolder(folderId);
    await client.emptyTrash();

    const rows = await eventsOf(storage.owner, client.id);

    expect(rows.map((row) => [row.accion, row.tipo_recurso, row.recurso_id])).toEqual([
      ['file.upload_rejected', 'upload', uploadId],
      ['node.trashed', 'folder', folderId],
      ['node.restored', 'folder', folderId],
      ['node.trashed', 'folder', folderId],
      ['trash.emptied', null, null],
    ]);
    expect(rows.every((row) => row.actor_id === client.id && row.correlation_id !== null)).toBe(
      true,
    );
  });
});
