import { randomUUID } from 'node:crypto';

import { accessEntrySchema, accessListSchema } from '@nimbo/contracts';
import type { Response } from 'supertest';

import { Role } from '../../../src/shared';
import { insertCommittedFile, textBytes } from '../storage/storage-http';
import type { StorageClient } from '../storage/storage-http';
import { insertFolder } from '../storage/storage-test-db';

import { createSharingHttpApp } from './sharing-http';
import type { SharesClient, SharingHttpApp } from './sharing-http';
import { insertShare } from './sharing-test-db';

const CORRELATION_HEADER = 'x-correlation-id';
const FOLDER_PREFIX = 'Contratos-confidenciales-7f3a';

interface ErrorBody {
  readonly code: string;
  readonly message: string;
  readonly fields?: readonly { field: string; reason: string }[];
}

const errorOf = (response: Response): { status: number; code: string } => ({
  status: response.status,
  code: (response.body as ErrorBody).code,
});

/** El cuerpo de error sin lo que cambia en cada petición. */
const stableError = (response: Response): Omit<ErrorBody, 'correlationId'> => {
  const { correlationId: _ignored, ...rest } = response.body as ErrorBody & {
    correlationId?: string;
  };
  return rest;
};

/**
 * `POST /shares` por HTTP con Postgres, Redis y el directorio reales (spec 012 CA-1 a CA-7, CA-19, CA-20). Ana comparte
 * sus nodos; Bruno es un cliente verificado y activo; Dani tiene sus propios archivos.
 */
describe('POST y GET /shares (012 CA-1 a CA-9, CA-19, CA-20)', () => {
  let sharing: SharingHttpApp;
  let ana: StorageClient;
  let bruno: StorageClient;
  let dani: StorageClient;
  let anaShares: SharesClient;
  let brunoEmail: string;

  /** Carpeta con un nombre único que la suite busca en bitácoras y auditoría (CA-19). */
  const newFolder = async (ownerId: string, deletedAt: Date | null = null): Promise<string> =>
    (
      await sharing.storage.owner.transaction((manager) =>
        insertFolder(manager, ownerId, { name: `${FOLDER_PREFIX}-${randomUUID()}`, deletedAt }),
      )
    ).id;

  const shareRows = (nodeId: string): Promise<{ nivel: string }[]> =>
    sharing.storage.owner.query(
      'SELECT nivel FROM comparticion WHERE archivo_id = $1 OR carpeta_id = $1',
      [nodeId],
    );

  const body = (nodeId: string, overrides: Record<string, unknown> = {}) => ({
    nodeType: 'folder',
    nodeId,
    email: brunoEmail,
    level: 'VIEWER',
    ...overrides,
  });

  beforeAll(async () => {
    sharing = await createSharingHttpApp();
    [ana, bruno, dani] = [
      await sharing.storage.newClient(),
      await sharing.storage.newClient(),
      await sharing.storage.newClient(),
    ];
    anaShares = sharing.sharesOf(ana);
    brunoEmail = await sharing.emailOf(bruno.id);
    await sharing.rename(bruno.id, 'Bruno Díaz');
  });

  afterEach(() => {
    sharing.storage.limits.setReadOnly(false);
  });

  afterAll(async () => {
    await sharing?.close();
  });

  it('CA-1, CA-19: 201 con la entrada directa, `no-store` y el evento en la actividad de Ana sin nombre ni correo', async () => {
    const folderId = await newFolder(ana.id);

    const response = await anaShares.share(
      body(folderId, { email: ` ${brunoEmail.toUpperCase()} ` }),
    );

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const entry = accessEntrySchema.parse(response.body);
    expect(entry).toMatchObject({
      grantee: { id: bruno.id, email: brunoEmail, displayName: 'Bruno Díaz' },
      level: 'VIEWER',
      origin: 'direct',
      inheritedFrom: null,
    });
    const events = (await sharing.eventsOf(ana.id)).filter((e) => e.recurso_id === folderId);
    expect(events).toEqual([
      {
        accion: 'share.granted',
        actor_id: ana.id,
        tipo_recurso: 'folder',
        recurso_id: folderId,
        atributos: { nodeType: 'folder', level: 'VIEWER' },
        correlation_id: response.headers[CORRELATION_HEADER] as string,
      },
    ]);
    const logs = JSON.stringify(sharing.storage.testApp.logs.lines());
    expect(logs).toContain('sharing.granted');
    expect(logs).not.toContain(brunoEmail);
    expect(logs).not.toContain(FOLDER_PREFIX);
    expect(JSON.stringify(events)).not.toContain(brunoEmail);
  });

  it('CA-5: compartir otra vez cambia el nivel sin duplicar (200, auditado); con el mismo nivel, 200 sin evento', async () => {
    const { fileId } = await insertCommittedFile(sharing.storage.owner, ana.id);
    const first = await anaShares.share(body(fileId, { nodeType: 'file' }));

    const changed = await anaShares.share(body(fileId, { nodeType: 'file', level: 'EDITOR' }));
    const same = await anaShares.share(body(fileId, { nodeType: 'file', level: 'EDITOR' }));

    expect([first.status, changed.status, same.status]).toEqual([201, 200, 200]);
    const shareId = (first.body as { shareId: string }).shareId;
    expect(changed.body).toMatchObject({ shareId, level: 'EDITOR' });
    expect(same.body).toMatchObject({ shareId, level: 'EDITOR' });
    await expect(shareRows(fileId)).resolves.toEqual([{ nivel: 'EDITOR' }]);
    const actions = (await sharing.eventsOf(ana.id))
      .filter((e) => e.recurso_id === fileId)
      .map((e) => [e.accion, e.atributos]);
    expect(actions).toEqual([
      ['share.granted', { nodeType: 'file', level: 'VIEWER' }],
      ['share.level_changed', { nodeType: 'file', level: 'EDITOR' }],
    ]);
  });

  it('CA-2: `OWNER` o un nivel desconocido es 422 `SHARING_INVALID_LEVEL` y no se crea nada', async () => {
    const folderId = await newFolder(ana.id);

    for (const level of ['OWNER', 'ADMIN']) {
      const response = await anaShares.share(body(folderId, { level }));
      expect(errorOf(response)).toEqual({ status: 422, code: 'SHARING_INVALID_LEVEL' });
    }
    await expect(shareRows(folderId)).resolves.toEqual([]);
  });

  it('CA-3: inexistente, interna, sin verificar y suspendida dan el mismo 422; contigo misma y mal formado, los suyos', async () => {
    const folderId = await newFolder(ana.id);
    const [internal, unverified, suspended] = [
      await sharing.storage.newClient(Role.SUPPORT),
      await sharing.storage.newClient(),
      await sharing.storage.newClient(),
    ];
    await sharing.storage.owner.query(
      'UPDATE usuario SET correo_verificado = false WHERE id = $1',
      [unverified.id],
    );
    await sharing.storage.owner.query("UPDATE usuario SET estado = 'suspendida' WHERE id = $1", [
      suspended.id,
    ]);
    const emails = [
      `nadie.${randomUUID()}@ejemplo.com`,
      ...(await Promise.all([internal, unverified, suspended].map((c) => sharing.emailOf(c.id)))),
    ];

    const responses = await Promise.all(
      emails.map((email) => anaShares.share(body(folderId, { email }))),
    );

    expect(responses.map((r) => r.status)).toEqual([422, 422, 422, 422]);
    expect(new Set(responses.map((r) => JSON.stringify(stableError(r)))).size).toBe(1);
    expect(stableError(responses[0] as Response)).toMatchObject({
      code: 'SHARING_RECIPIENT_NOT_FOUND',
    });
    const self = await anaShares.share(body(folderId, { email: await sharing.emailOf(ana.id) }));
    expect(errorOf(self)).toEqual({ status: 422, code: 'SHARING_CANNOT_SHARE_WITH_SELF' });
    const malformed = await anaShares.share(body(folderId, { email: 'no-es-un-correo' }));
    expect(errorOf(malformed)).toEqual({ status: 422, code: 'SHARING_INVALID_REQUEST' });
    expect((malformed.body as ErrorBody).fields).toEqual([
      expect.objectContaining({ field: 'email', reason: 'INVALID_EMAIL' }),
    ]);
    await expect(shareRows(folderId)).resolves.toEqual([]);
  });

  it('CA-4: ajeno, inexistente, en la papelera, de otro tipo o donde es Editora es el 404 de lo inexistente', async () => {
    const danisFolder = await newFolder(dani.id);
    const trashed = await newFolder(ana.id, new Date());
    const anasFolder = await newFolder(ana.id);
    await insertShare(sharing.storage.owner, {
      ownerId: ana.id,
      granteeId: dani.id,
      node: { folderId: anasFolder },
      level: 'EDITOR',
    });
    const danisAttempt = await sharing.sharesOf(dani).share(body(anasFolder));

    const responses = [
      await anaShares.share(body(danisFolder)),
      await anaShares.share(body(randomUUID())),
      await anaShares.share(body(trashed)),
      await anaShares.share(body(anasFolder, { nodeType: 'file' })),
      danisAttempt,
    ];

    for (const response of responses) {
      expect(errorOf(response)).toEqual({ status: 404, code: 'STORAGE_NODE_NOT_FOUND' });
    }
    await expect(shareRows(danisFolder)).resolves.toEqual([]);
    await expect(shareRows(anasFolder)).resolves.toEqual([{ nivel: 'EDITOR' }]);
  });

  it('CA-6: en solo lectura, compartir con alguien nuevo o subir a EDITOR es 403; bajar a VIEWER se permite', async () => {
    const [newOne, upgraded, downgraded] = [
      await newFolder(ana.id),
      await newFolder(ana.id),
      await newFolder(ana.id),
    ];
    await anaShares.share(body(upgraded));
    await anaShares.share(body(downgraded, { level: 'EDITOR' }));
    sharing.storage.limits.setReadOnly(true);

    const responses = [
      await anaShares.share(body(newOne)),
      await anaShares.share(body(upgraded, { level: 'EDITOR' })),
    ];
    const lowered = await anaShares.share(body(downgraded, { level: 'VIEWER' }));

    for (const response of responses) {
      expect(errorOf(response)).toEqual({ status: 403, code: 'STORAGE_ACCOUNT_READ_ONLY' });
    }
    await expect(shareRows(newOne)).resolves.toEqual([]);
    await expect(shareRows(upgraded)).resolves.toEqual([{ nivel: 'VIEWER' }]);
    expect(lowered.status).toBe(200);
    await expect(shareRows(downgraded)).resolves.toEqual([{ nivel: 'VIEWER' }]);
  });

  it('CA-20: Administrador, Soporte y Operador reciben 403 `SHARED_FORBIDDEN`; sin token, 401', async () => {
    const folderId = await newFolder(ana.id);

    for (const role of [Role.ADMIN, Role.SUPPORT, Role.OPERATOR]) {
      const internal = await sharing.storage.newClient(role);
      const response = await sharing.sharesOf(internal).share(body(folderId));
      expect(errorOf(response)).toEqual({ status: 403, code: 'SHARED_FORBIDDEN' });
    }
    const anonymous = sharing.sharesOf(sharing.storage.clientFor(randomUUID()));
    expect(errorOf(await anonymous.share(body(folderId)))).toEqual({
      status: 401,
      code: 'SHARED_UNAUTHENTICATED',
    });
    await expect(shareRows(folderId)).resolves.toEqual([]);
  });

  describe('GET /shares (CA-8, CA-9)', () => {
    /** «Proyectos» ⊃ «Acme» ⊃ contrato, y un archivo suelto en la raíz de Ana. */
    let tree: { projects: string; acme: string; contract: string; loose: string };
    let carla: StorageClient;

    const entriesOf = async (client: SharesClient, nodeType: string, nodeId: string) => {
      const response = await client.accessList({ nodeType, nodeId });
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      return accessListSchema
        .parse(response.body)
        .entries.map((entry) => [
          entry.origin,
          entry.grantee.id,
          entry.level,
          entry.inheritedFrom?.folderId ?? entry.shareId,
        ]);
    };

    beforeAll(async () => {
      carla = await sharing.storage.newClient();
      const [projects, acme] = await sharing.storage.owner.transaction(async (manager) => {
        const root = await insertFolder(manager, ana.id, { name: `Proyectos-${randomUUID()}` });
        return [root, await insertFolder(manager, ana.id, { name: 'Acme', parent: root })];
      });
      const file = (folderId: string | null) =>
        insertCommittedFile(sharing.storage.owner, ana.id, { folderId });
      tree = {
        projects: projects.id,
        acme: acme.id,
        contract: (await file(acme.id)).fileId,
        loose: (await file(null)).fileId,
      };
    });

    it('CA-8: cada persona con nombre, correo, nivel y fecha; `direct` con `shareId` e `inherited` con su carpeta', async () => {
      const share = (
        granteeId: string,
        node: { fileId: string } | { folderId: string },
        level: string,
      ) => insertShare(sharing.storage.owner, { ownerId: ana.id, granteeId, node, level });
      const onProjects = await share(bruno.id, { folderId: tree.projects }, 'VIEWER');
      const onAcme = await share(carla.id, { folderId: tree.acme }, 'EDITOR');
      const onContract = await share(bruno.id, { fileId: tree.contract }, 'EDITOR');

      const response = await anaShares.accessList({ nodeType: 'file', nodeId: tree.contract });

      const [direct] = accessListSchema.parse(response.body).entries;
      expect(direct).toEqual({
        shareId: onContract,
        grantee: { id: bruno.id, displayName: 'Bruno Díaz', email: brunoEmail },
        level: 'EDITOR',
        origin: 'direct',
        inheritedFrom: null,
        createdAt: expect.any(String) as string,
      });
      await expect(entriesOf(anaShares, 'file', tree.contract)).resolves.toEqual([
        ['direct', bruno.id, 'EDITOR', onContract],
        ['inherited', bruno.id, 'VIEWER', tree.projects],
        ['inherited', carla.id, 'EDITOR', tree.acme],
      ]);
      await expect(entriesOf(anaShares, 'folder', tree.acme)).resolves.toEqual([
        ['direct', carla.id, 'EDITOR', onAcme],
        ['inherited', bruno.id, 'VIEWER', tree.projects],
      ]);
      await expect(entriesOf(anaShares, 'folder', tree.projects)).resolves.toEqual([
        ['direct', bruno.id, 'VIEWER', onProjects],
      ]);
      await expect(entriesOf(anaShares, 'file', tree.loose)).resolves.toEqual([]);
    });

    it('CA-9: Lector, Editora, ajeno, inexistente o de otro tipo es 404; un rol interno 403 y sin token 401', async () => {
      await insertShare(sharing.storage.owner, {
        ownerId: ana.id,
        granteeId: dani.id,
        node: { folderId: tree.projects },
        level: 'EDITOR',
      });
      const attempts = [
        await sharing.sharesOf(bruno).accessList({ nodeType: 'folder', nodeId: tree.projects }),
        await sharing.sharesOf(dani).accessList({ nodeType: 'folder', nodeId: tree.acme }),
        await sharing.sharesOf(dani).accessList({ nodeType: 'file', nodeId: tree.loose }),
        await anaShares.accessList({ nodeType: 'folder', nodeId: randomUUID() }),
        await anaShares.accessList({ nodeType: 'file', nodeId: tree.projects }),
      ];
      const support = await sharing.storage.newClient(Role.SUPPORT);
      const anonymous = sharing.sharesOf(sharing.storage.clientFor(randomUUID()));
      const query = { nodeType: 'folder', nodeId: tree.projects };

      for (const response of attempts) {
        expect(errorOf(response)).toEqual({ status: 404, code: 'STORAGE_NODE_NOT_FOUND' });
      }
      expect(errorOf(await sharing.sharesOf(support).accessList(query))).toEqual({
        status: 403,
        code: 'SHARED_FORBIDDEN',
      });
      expect(errorOf(await anonymous.accessList(query))).toEqual({
        status: 401,
        code: 'SHARED_UNAUTHENTICATED',
      });
    });

    it('CA-9: una consulta mal formada es 422 `SHARING_INVALID_REQUEST` con `fields`', async () => {
      const response = await anaShares.accessList({ nodeType: 'carga', nodeId: 'abc' });

      expect(errorOf(response)).toEqual({ status: 422, code: 'SHARING_INVALID_REQUEST' });
      expect((response.body as ErrorBody).fields?.map((field) => field.field).sort()).toEqual([
        'nodeId',
        'nodeType',
      ]);
    });
  });

  describe('DELETE /shares/:shareId (CA-10, CA-11, CA-18)', () => {
    const SHARE_NOT_FOUND = { status: 404, code: 'SHARING_SHARE_NOT_FOUND' };
    const NODE_NOT_FOUND = { status: 404, code: 'STORAGE_NODE_NOT_FOUND' };
    const UPLOADED_BYTES = 64;

    /**
     * Carpeta de Ana con un archivo subido dentro (cuenta en su espacio: la purga lo descuenta), compartida con Bruno
     * como Lector (fila directa: `POST /shares` ya lo cubre y su límite de intentos es por minuto).
     */
    const sharedFolder = async (): Promise<{
      folderId: string;
      fileId: string;
      shareId: string;
    }> => {
      const folderId = await newFolder(ana.id);
      const uploaded = await ana.upload('informe.txt', textBytes(UPLOADED_BYTES), 'ask', folderId);
      expect(uploaded.status).toBe(200);
      const fileId = (uploaded.body as { file: { id: string } }).file.id;
      const shareId = await insertShare(sharing.storage.owner, {
        ownerId: ana.id,
        granteeId: bruno.id,
        node: { folderId },
      });
      return { folderId, fileId, shareId };
    };

    /** Lo que Bruno ve de la carpeta compartida: su contenido y la ficha del archivo de dentro. */
    const brunoSees = async (folder: { folderId: string; fileId: string }) => [
      errorOf(await bruno.folderContents({ folderId: folder.folderId })).status,
      errorOf(await bruno.fileDetail(folder.fileId)).status,
    ];

    it('CA-10, CA-19: 204, el destinatario recibe 404 desde la siguiente petición y queda `share.revoked`', async () => {
      const folder = await sharedFolder();
      await expect(brunoSees(folder)).resolves.toEqual([200, 200]);

      const response = await anaShares.revoke(folder.shareId);

      expect(response.status).toBe(204);
      expect(errorOf(await bruno.folderContents({ folderId: folder.folderId }))).toEqual(
        NODE_NOT_FOUND,
      );
      expect(errorOf(await bruno.fileDetail(folder.fileId))).toEqual(NODE_NOT_FOUND);
      await expect(shareRows(folder.folderId)).resolves.toEqual([]);
      const revoked = (await sharing.eventsOf(ana.id)).filter(
        (e) => e.recurso_id === folder.folderId && e.accion === 'share.revoked',
      );
      expect(revoked).toEqual([
        {
          accion: 'share.revoked',
          actor_id: ana.id,
          tipo_recurso: 'folder',
          recurso_id: folder.folderId,
          atributos: { nodeType: 'folder', level: 'VIEWER' },
          correlation_id: response.headers[CORRELATION_HEADER] as string,
        },
      ]);
      const logs = JSON.stringify(sharing.storage.testApp.logs.lines());
      expect(logs).toContain('sharing.revoked');
      expect(logs).not.toContain(brunoEmail);
      expect(logs).not.toContain(FOLDER_PREFIX);
    });

    it('CA-11: ajeno, del que es destinatario, inexistente, ya revocado o mal formado es 404 y nada cambia', async () => {
      const folder = await sharedFolder();
      const danisFolder = await newFolder(dani.id);
      const danisShare = await insertShare(sharing.storage.owner, {
        ownerId: dani.id,
        granteeId: bruno.id,
        node: { folderId: danisFolder },
      });
      const revokedFolder = await sharedFolder();
      expect((await anaShares.revoke(revokedFolder.shareId)).status).toBe(204);

      const responses = [
        await anaShares.revoke(danisShare),
        await sharing.sharesOf(bruno).revoke(folder.shareId),
        await anaShares.revoke(randomUUID()),
        await anaShares.revoke(revokedFolder.shareId),
        await anaShares.revoke('no-es-un-uuid'),
      ];

      for (const response of responses) expect(errorOf(response)).toEqual(SHARE_NOT_FOUND);
      await expect(shareRows(danisFolder)).resolves.toEqual([{ nivel: 'VIEWER' }]);
      await expect(shareRows(folder.folderId)).resolves.toEqual([{ nivel: 'VIEWER' }]);
      const revocations = (await sharing.eventsOf(ana.id)).filter(
        (e) => e.recurso_id === revokedFolder.folderId && e.accion === 'share.revoked',
      );
      expect(revocations).toHaveLength(1);
    });

    it('CA-6: con la cuenta en solo lectura, revocar se permite', async () => {
      const folder = await sharedFolder();
      sharing.storage.limits.setReadOnly(true);

      expect((await anaShares.revoke(folder.shareId)).status).toBe(204);
      await expect(shareRows(folder.folderId)).resolves.toEqual([]);
    });

    it('CA-18: en la papelera la compartición se conserva y vuelve al restaurar; la purga definitiva la borra', async () => {
      const folder = await sharedFolder();
      await insertShare(sharing.storage.owner, {
        ownerId: ana.id,
        granteeId: dani.id,
        node: { fileId: folder.fileId },
      });

      expect((await ana.trashFolder(folder.folderId)).status).toBe(200);
      await expect(brunoSees(folder)).resolves.toEqual([404, 404]);
      await expect(shareRows(folder.folderId)).resolves.toEqual([{ nivel: 'VIEWER' }]);
      expect((await ana.restoreFolder(folder.folderId)).status).toBe(200);
      await expect(brunoSees(folder)).resolves.toEqual([200, 200]);
      expect((await ana.trashFolder(folder.folderId)).status).toBe(200);
      expect((await ana.purgeFolder(folder.folderId)).status).toBe(200);

      await expect(shareRows(folder.folderId)).resolves.toEqual([]);
      await expect(shareRows(folder.fileId)).resolves.toEqual([]);
    });
  });
});

describe('POST /shares con el límite de intentos (012 CA-7)', () => {
  const ATTEMPTS = 2;
  let sharing: SharingHttpApp;

  beforeAll(async () => {
    sharing = await createSharingHttpApp({
      env: { SHARING_RATE_LIMIT_PER_MINUTE: String(ATTEMPTS) },
    });
  });

  afterAll(async () => {
    await sharing?.close();
  });

  it('CA-7: superado el límite, 429 `SHARED_TOO_MANY_REQUESTS` con la espera, exista o no el correo', async () => {
    const ana = await sharing.storage.newClient();
    const bruno = await sharing.storage.newClient();
    const shares = sharing.sharesOf(ana);
    const attempt = (email: string) =>
      shares.share({ nodeType: 'folder', nodeId: randomUUID(), email, level: 'VIEWER' });
    for (let i = 0; i < ATTEMPTS; i += 1) await attempt(`nadie.${randomUUID()}@ejemplo.com`);

    const responses = [
      await attempt(await sharing.emailOf(bruno.id)),
      await attempt(`nadie.${randomUUID()}@ejemplo.com`),
    ];

    for (const response of responses) {
      expect(errorOf(response)).toEqual({ status: 429, code: 'SHARED_TOO_MANY_REQUESTS' });
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    }
    expect(stableError(responses[0] as Response)).toEqual(stableError(responses[1] as Response));
  });
});
