import { randomUUID } from 'node:crypto';

import { receivedSharesSchema } from '@nimbo/contracts';
import type { Response } from 'supertest';

import { Role } from '../../../src/shared';
import { insertCommittedFile } from '../storage/storage-http';
import type { StorageClient } from '../storage/storage-http';
import { insertFolder } from '../storage/storage-test-db';

import { createSharingHttpApp } from './sharing-http';
import type { SharingHttpApp } from './sharing-http';
import { insertShare } from './sharing-test-db';
import type { SharedNode } from './sharing-test-db';

const BASE_TIME = Date.parse('2026-10-01T10:00:00.000Z');
const MINUTE_MS = 60_000;

const errorOf = (response: Response): { status: number; code: unknown } => ({
  status: response.status,
  code: (response.body as { code?: unknown }).code,
});

/** Una fecha de alta fija, `minutes` después de la base, para que el orden de CA-22 no dependa del reloj. */
const at = (minutes: number): Date => new Date(BASE_TIME + minutes * MINUTE_MS);

/**
 * Lo compartido conmigo por HTTP (spec 012 CA-22, S-8). Ana y Carla comparten con Bruno; Eva también,
 * pero está suspendida; Dani no recibe nada.
 */
describe('GET /shares/received (012 CA-22)', () => {
  let sharing: SharingHttpApp;
  let ana: StorageClient;
  let bruno: StorageClient;
  let carla: StorageClient;
  let dani: StorageClient;
  /** Lo de Ana que Bruno recibe: «Proyectos» ⊃ «Acme» (heredada) y un informe en su raíz. */
  let shared: { projects: string; acme: string; report: string; carlas: string };
  let ids: { projects: string; report: string; carlas: string };

  const folderOf = async (ownerId: string, name: string, deletedAt: Date | null = null) =>
    (
      await sharing.storage.owner.transaction((manager) =>
        insertFolder(manager, ownerId, { name, deletedAt }),
      )
    ).id;

  const shareWithBruno = (ownerId: string, node: SharedNode, level: string, minutes: number) =>
    insertShare(sharing.storage.owner, {
      ownerId,
      granteeId: bruno.id,
      node,
      level,
      createdAt: at(minutes),
    });

  beforeAll(async () => {
    sharing = await createSharingHttpApp();
    [ana, bruno, carla, dani] = [
      await sharing.storage.newClient(),
      await sharing.storage.newClient(),
      await sharing.storage.newClient(),
      await sharing.storage.newClient(),
    ];
    const eva = await sharing.storage.newClient();
    await sharing.storage.owner.query("UPDATE usuario SET nombre = 'Carla Ruiz' WHERE id = $1", [
      carla.id,
    ]);
    const [projects, acme] = await sharing.storage.owner.transaction(async (manager) => {
      const root = await insertFolder(manager, ana.id, { name: 'Proyectos' });
      return [root, await insertFolder(manager, ana.id, { name: 'Acme', parent: root })];
    });
    shared = {
      projects: projects.id,
      acme: acme.id,
      report: (await insertCommittedFile(sharing.storage.owner, ana.id, { name: 'informe.pdf' }))
        .fileId,
      carlas: await folderOf(carla.id, 'Presupuestos'),
    };
    ids = {
      projects: await shareWithBruno(ana.id, { folderId: shared.projects }, 'VIEWER', 1),
      report: await shareWithBruno(ana.id, { fileId: shared.report }, 'EDITOR', 3),
      carlas: await shareWithBruno(carla.id, { folderId: shared.carlas }, 'VIEWER', 4),
    };
    await shareWithBruno(
      ana.id,
      { folderId: await folderOf(ana.id, 'Vieja', new Date()) },
      'VIEWER',
      2,
    );
    await shareWithBruno(eva.id, { folderId: await folderOf(eva.id, 'De Eva') }, 'EDITOR', 5);
    await sharing.storage.owner.query("UPDATE usuario SET estado = 'suspendida' WHERE id = $1", [
      eva.id,
    ]);
  });

  afterAll(async () => {
    await sharing?.close();
  });

  it('CA-22: los directos vigentes con tipo, nombre, propietario, nivel y fecha, más recientes primero y `no-store`', async () => {
    const response = await sharing.sharesOf(bruno).received();

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(receivedSharesSchema.parse(response.body).entries).toEqual([
      {
        shareId: ids.carlas,
        nodeType: 'folder',
        nodeId: shared.carlas,
        name: 'Presupuestos',
        owner: { displayName: 'Carla Ruiz' },
        level: 'VIEWER',
        createdAt: at(4).toISOString(),
      },
      {
        shareId: ids.report,
        nodeType: 'file',
        nodeId: shared.report,
        name: 'informe.pdf',
        owner: { displayName: 'Ana López' },
        level: 'EDITOR',
        createdAt: at(3).toISOString(),
      },
      {
        shareId: ids.projects,
        nodeType: 'folder',
        nodeId: shared.projects,
        name: 'Proyectos',
        owner: { displayName: 'Ana López' },
        level: 'VIEWER',
        createdAt: at(1).toISOString(),
      },
    ]);
  });

  it('CA-22: sin accesos directos conmigo, `[]`; lo que comparto no cuenta como recibido', async () => {
    for (const client of [dani, ana]) {
      const response = await sharing.sharesOf(client).received();
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ entries: [] });
    }
  });

  it('CA-22: Administrador, Soporte y Operador reciben 403 `SHARED_FORBIDDEN`; sin token, 401', async () => {
    for (const role of [Role.ADMIN, Role.SUPPORT, Role.OPERATOR]) {
      const internal = await sharing.storage.newClient(role);
      expect(errorOf(await sharing.sharesOf(internal).received())).toEqual({
        status: 403,
        code: 'SHARED_FORBIDDEN',
      });
    }
    const anonymous = sharing.sharesOf(sharing.storage.clientFor(randomUUID()));
    expect(errorOf(await anonymous.received())).toEqual({
      status: 401,
      code: 'SHARED_UNAUTHENTICATED',
    });
  });
});

/**
 * Salir de un acceso recibido por HTTP (spec 012 CA-23, S-8): Ana comparte con Bruno; Carla es un tercero.
 */
describe('DELETE /shares/received/:shareId (012 CA-23)', () => {
  const NODE_NOT_FOUND = { status: 404, code: 'STORAGE_NODE_NOT_FOUND' };
  const SHARE_NOT_FOUND = { status: 404, code: 'SHARING_SHARE_NOT_FOUND' };
  let sharing: SharingHttpApp;
  let ana: StorageClient;
  let bruno: StorageClient;
  let carla: StorageClient;

  /** Un informe de Ana compartido con Bruno como Lector. */
  const sharedReport = async (): Promise<{ fileId: string; shareId: string }> => {
    const { fileId } = await insertCommittedFile(sharing.storage.owner, ana.id, {
      name: `informe-${randomUUID()}.pdf`,
    });
    const shareId = await insertShare(sharing.storage.owner, {
      ownerId: ana.id,
      granteeId: bruno.id,
      node: { fileId },
    });
    return { fileId, shareId };
  };

  const accessOf = async (fileId: string): Promise<unknown[]> => {
    const response = await sharing.sharesOf(ana).accessList({ nodeType: 'file', nodeId: fileId });
    return (response.body as { entries: unknown[] }).entries;
  };

  beforeAll(async () => {
    sharing = await createSharingHttpApp();
    [ana, bruno, carla] = [
      await sharing.storage.newClient(),
      await sharing.storage.newClient(),
      await sharing.storage.newClient(),
    ];
  });

  afterEach(() => {
    sharing.storage.limits.setReadOnly(false);
  });

  afterAll(async () => {
    await sharing?.close();
  });

  it('CA-23, CA-19: 204, 404 sobre el nodo desde la siguiente petición, Ana ya no lo ve y queda `share.revoked` en su actividad', async () => {
    const report = await sharedReport();
    expect((await bruno.fileDetail(report.fileId)).status).toBe(200);

    const response = await sharing.sharesOf(bruno).leave(report.shareId);

    expect(response.status).toBe(204);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(errorOf(await bruno.fileDetail(report.fileId))).toEqual(NODE_NOT_FOUND);
    await expect(accessOf(report.fileId)).resolves.toEqual([]);
    const events = (await sharing.eventsOf(ana.id)).filter((e) => e.recurso_id === report.fileId);
    expect(events).toEqual([
      expect.objectContaining({
        accion: 'share.revoked',
        actor_id: bruno.id,
        tipo_recurso: 'file',
        atributos: { nodeType: 'file', level: 'VIEWER' },
      }),
    ]);
  });

  it('CA-23 (010 RN-6): se permite aunque la cuenta esté en solo lectura', async () => {
    const report = await sharedReport();
    sharing.storage.limits.setReadOnly(true);

    expect((await sharing.sharesOf(bruno).leave(report.shareId)).status).toBe(204);
  });

  it('CA-23: un `shareId` ajeno, inexistente, ya usado o que no es UUID da 404 `SHARING_SHARE_NOT_FOUND` y nada cambia', async () => {
    const report = await sharedReport();

    expect(errorOf(await sharing.sharesOf(carla).leave(report.shareId))).toEqual(SHARE_NOT_FOUND);
    expect(errorOf(await sharing.sharesOf(ana).leave(report.shareId))).toEqual(SHARE_NOT_FOUND);
    expect(errorOf(await sharing.sharesOf(bruno).leave(randomUUID()))).toEqual(SHARE_NOT_FOUND);
    expect(errorOf(await sharing.sharesOf(bruno).leave('no-es-uuid'))).toEqual(SHARE_NOT_FOUND);
    expect((await bruno.fileDetail(report.fileId)).status).toBe(200);

    expect((await sharing.sharesOf(bruno).leave(report.shareId)).status).toBe(204);
    expect(errorOf(await sharing.sharesOf(bruno).leave(report.shareId))).toEqual(SHARE_NOT_FOUND);
  });

  it('CA-23: Administrador, Soporte y Operador reciben 403 `SHARED_FORBIDDEN`', async () => {
    const report = await sharedReport();
    for (const role of [Role.ADMIN, Role.SUPPORT, Role.OPERATOR]) {
      const internal = await sharing.storage.newClient(role);
      expect(errorOf(await sharing.sharesOf(internal).leave(report.shareId))).toEqual({
        status: 403,
        code: 'SHARED_FORBIDDEN',
      });
    }
  });
});
