import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import {
  fileDetailResponseSchema,
  folderContentsResponseSchema,
  receivedSharesSchema,
} from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import { Role } from '../../src/shared';
import { createSharingHttpApp } from '../int/sharing/sharing-http';
import type { SharesClient, SharingHttpApp } from '../int/sharing/sharing-http';
import { insertShare } from '../int/sharing/sharing-test-db';
import { insertCommittedFile } from '../int/storage/storage-http';
import type { StorageClient } from '../int/storage/storage-http';
import { insertFileWithVersion, insertFolder } from '../int/storage/storage-test-db';

import { comparable, INTERNAL_ROLES } from './setup/isolation-assertions';

const API_PREFIX = '/api/v1';
/** Límites altos: la suite mide respuestas, no el límite de CA-7 (ya probado en `shares.int-spec.ts`). */
const GENEROUS_LIMITS = {
  SHARING_RATE_LIMIT_PER_MINUTE: '1000',
  RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE: '1000',
};
/** A y B tienen un archivo con el mismo nombre en su raíz: nada los distingue salvo el id. */
const SAME_NAME = 'Contrato de arrendamiento.pdf';
const NOT_FOUND = { status: 404, code: 'STORAGE_NODE_NOT_FOUND' };
const SHARE_NOT_FOUND = { status: 404, code: 'SHARING_SHARE_NOT_FOUND' };
/** Muestras por tipo de correo para la mediana de CA-3 (R-5) y la diferencia que se tolera entre medianas. */
const TIMING_ROUNDS = 15;
const TIMING_TOLERANCE_MS = 25;

/** Un cliente con sus rutas de `storage` y de `sharing`. */
interface Party {
  readonly storage: StorageClient;
  readonly shares: SharesClient;
}

type NodeKind = 'file' | 'folder';
type Probe = readonly [label: string, call: (party: Party, id: string) => Promise<Response>];

/** Toda ruta que lee un nodo por id (ficha, descarga, historial, contenido, migas, accesos y fijado). */
const READ_PROBES: Readonly<Record<NodeKind, readonly Probe[]>> = {
  file: [
    ['GET /files/:id', (p, id) => p.storage.fileDetail(id)],
    ['POST /files/:id/download-url', (p, id) => p.storage.downloadUrl(id)],
    ['GET /files/:id/versions', (p, id) => p.storage.fileVersions(id)],
    ['PUT /quick-access/pins/files/:id', (p, id) => p.storage.pin('files', id)],
    ['GET /shares (archivo)', (p, id) => p.shares.accessList({ nodeType: 'file', nodeId: id })],
  ],
  folder: [
    ['GET /folders/contents?folderId', (p, id) => p.storage.folderContents({ folderId: id })],
    ['PUT /quick-access/pins/folders/:id', (p, id) => p.storage.pin('folders', id)],
    ['GET /shares (carpeta)', (p, id) => p.shares.accessList({ nodeType: 'folder', nodeId: id })],
  ],
};

/** Lo de A: una carpeta con subárbol (Lector), una carpeta vacía y un archivo (Editor) y lo que no comparte. */
interface WorldOfA {
  readonly folders: { readonly shared: string; readonly sub: string; readonly editor: string };
  readonly files: { readonly inSub: string; readonly inFolder: string; readonly direct: string };
  readonly unshared: { readonly folder: string; readonly file: string };
  readonly shareIds: { readonly folder: string; readonly file: string };
}

const errorOf = (response: Response) => ({
  status: response.status,
  code: (response.body as { code?: string }).code,
});

const seedA = (owner: DataSource, a: string, b: string): Promise<WorldOfA> =>
  owner.transaction(async (m) => {
    const shared = await insertFolder(m, a, { name: 'Proyecto' });
    const sub = await insertFolder(m, a, { name: 'Anexos', parent: shared });
    const editor = await insertFolder(m, a, { name: 'Borradores' });
    const unsharedFolder = await insertFolder(m, a, { name: 'Privada' });
    const file = async (name: string, folderId: string | null = null) =>
      (await insertFileWithVersion(m, a, { name, folderId })).fileId;
    const files = {
      inSub: await file(SAME_NAME, sub.id),
      inFolder: await file(SAME_NAME, shared.id),
      direct: await file(SAME_NAME),
    };
    const share = (node: { fileId: string } | { folderId: string }, level: string) =>
      insertShare(m, { ownerId: a, granteeId: b, node, level });
    const shareIds = {
      folder: await share({ folderId: shared.id }, 'VIEWER'),
      file: await share({ fileId: files.direct }, 'EDITOR'),
    };
    await share({ folderId: editor.id }, 'EDITOR');
    return {
      folders: { shared: shared.id, sub: sub.id, editor: editor.id },
      files,
      unshared: { folder: unsharedFolder.id, file: await file('Nómina.pdf') },
      shareIds,
    };
  });

/** Todos los nodos de A por tipo, compartidos o no. */
const everyNodeOf = (world: WorldOfA): Readonly<Record<NodeKind, string[]>> => ({
  file: [...Object.values(world.files), world.unshared.file],
  folder: [...Object.values(world.folders), world.unshared.folder],
});

/** Cada ruta de lectura sobre cada id da el mismo 404 que con un id inexistente. */
const expectUnreachable = async (party: Party, kind: NodeKind, ids: readonly string[]) => {
  for (const id of ids) {
    for (const [label, call] of READ_PROBES[kind]) {
      const [hit, missing] = [await call(party, id), await call(party, randomUUID())];
      expect({ label, id, ...comparable(hit) }).toEqual({ label, id, ...comparable(missing) });
      expect({ label, status: hit.status }).toEqual({ label, status: 404 });
    }
  }
};

/** Ids de la raíz de «Mis archivos» de `party`. */
const rootIdsOf = async (party: Party): Promise<string[]> => {
  const body = folderContentsResponseSchema.parse((await party.storage.folderContents()).body);
  return body.items.map((item) => item.id);
};

const receivedNodeIds = async (party: Party): Promise<string[]> => {
  const response = await party.shares.received();
  expect(response.status).toBe(200);
  return receivedSharesSchema
    .parse(response.body)
    .entries.map((entry) => entry.nodeId)
    .sort();
};

/** Lo que ve quien llama, sin la hora de la respuesta (no depende de la cuenta). */
const observe = (response: Response) => {
  const { date: _date, ...headers } = response.headers as Record<string, unknown>;
  return { status: response.status, body: response.body as unknown, headers };
};

const median = (samples: readonly number[]): number => {
  const sorted = [...samples].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

/**
 * Aislamiento de compartición por HTTP (spec 012 CA-3, CA-14, CA-17, CA-20, CA-21, CA-22, CA-23; plan §6, R-1, R-5):
 * A comparte con B; C no tiene nada compartido. Cada intento sobre lo que no le toca es el mismo 404 que con un id
 * inexistente. Las *fixtures* se insertan como el dueño; la app corre como `nimbo_app`. La RLS sin filtro y
 * `nodos_compartidos()` con dueño `NOSUPERUSER` están en `sharing-rls.iso-spec.ts`.
 */
describe('aislamiento de compartición entre cuentas por HTTP (012 CA-21)', () => {
  let sharing: SharingHttpApp;
  let a: Party;
  let b: Party;
  let c: Party;
  let world: WorldOfA;
  let ownOfB: { readonly folder: string; readonly file: string };

  const partyOf = (storage: StorageClient): Party => ({
    storage,
    shares: sharing.sharesOf(storage),
  });
  const newParty = async (role: Role = Role.CLIENT): Promise<Party> =>
    partyOf(await sharing.storage.newClient(role));
  const shareRowsOf = (ownerId: string): Promise<unknown[]> =>
    sharing.storage.owner.query(
      'SELECT id, destinatario_id, nivel FROM comparticion WHERE propietario_id = $1 ORDER BY id',
      [ownerId],
    );
  const setStatus = (party: Party, status: 'activa' | 'suspendida'): Promise<unknown> =>
    sharing.storage.owner.query('UPDATE usuario SET estado = $2 WHERE id = $1', [
      party.storage.id,
      status,
    ]);

  beforeAll(async () => {
    sharing = await createSharingHttpApp({ env: GENEROUS_LIMITS });
    [a, b, c] = [await newParty(), await newParty(), await newParty()];
    world = await seedA(sharing.storage.owner, a.storage.id, b.storage.id);
    ownOfB = await sharing.storage.owner.transaction(async (m) => {
      const folder = await insertFolder(m, b.storage.id, { name: 'Proyecto' });
      const file = await insertFileWithVersion(m, b.storage.id, { name: SAME_NAME });
      return { folder: folder.id, file: file.fileId };
    });
  });

  afterAll(async () => {
    await sharing?.close();
  });

  describe('CA-21: A, B y C', () => {
    it('ISO-1: C no puede abrir, descargar, listar, ver migas, accesos ni fijar nada de A', async () => {
      const nodes = everyNodeOf(world);

      await expectUnreachable(c, 'file', nodes.file);
      await expectUnreachable(c, 'folder', nodes.folder);
      expect(await receivedNodeIds(c)).toEqual([]);
      const root = await rootIdsOf(c);
      expect(root.filter((id) => [...nodes.file, ...nodes.folder].includes(id))).toEqual([]);
    });

    it('ISO-2: B alcanza la carpeta compartida con su subárbol y el archivo directo, con su nivel', async () => {
      const levels = await Promise.all(
        Object.values(world.files).map(async (id) => {
          const response = await b.storage.fileDetail(id);
          return fileDetailResponseSchema.parse(response.body).accessLevel;
        }),
      );
      const sub = await b.storage.folderContents({ folderId: world.folders.sub });
      const crumbs = folderContentsResponseSchema.parse(sub.body).breadcrumbs.map((f) => f.id);

      expect(levels).toEqual(['VIEWER', 'VIEWER', 'EDITOR']);
      expect(crumbs).toEqual([world.folders.shared, world.folders.sub]);
      expect((await b.storage.downloadUrl(world.files.inSub)).status).toBe(200);
      expect(await receivedNodeIds(b)).toEqual(
        [world.folders.shared, world.folders.editor, world.files.direct].sort(),
      );
    });

    it('ISO-3: B no puede alcanzar lo que A no le compartió, ni ve lo compartido en su raíz', async () => {
      await expectUnreachable(b, 'file', [world.unshared.file]);
      await expectUnreachable(b, 'folder', [world.unshared.folder]);
      const nodes = everyNodeOf(world);

      const root = await rootIdsOf(b);

      expect(root.filter((id) => [...nodes.file, ...nodes.folder].includes(id))).toEqual([]);
      expect(root.sort()).toEqual([ownOfB.folder, ownOfB.file].sort());
    });

    it('ISO-4: A no puede alcanzar nada de B ni recibe lo que ella compartió', async () => {
      await expectUnreachable(a, 'file', [ownOfB.file]);
      await expectUnreachable(a, 'folder', [ownOfB.folder]);

      expect(await receivedNodeIds(a)).toEqual([]);
    });

    it('ISO-5: lo que B recibe no lleva el correo de A ni datos de almacenamiento', async () => {
      const visible = JSON.stringify((await b.shares.received()).body);

      expect(visible).not.toContain(await sharing.emailOf(a.storage.id));
      expect(visible).not.toMatch(/u\/[0-9a-f-]{36}\//);
      expect(visible).not.toContain('Privada');
    });
  });

  describe('CA-14: el destinatario no administra lo ajeno', () => {
    it('ISO-6: B (Lector y Editor) no puede compartir, ver accesos ni revocar sobre lo de A', async () => {
      const before = await shareRowsOf(a.storage.id);
      const email = await sharing.emailOf(c.storage.id);
      const targets: [NodeKind, string][] = [
        ['folder', world.folders.shared],
        ['folder', world.folders.sub],
        ['folder', world.folders.editor],
        ['file', world.files.inSub],
        ['file', world.files.direct],
      ];
      for (const [nodeType, nodeId] of targets) {
        for (const level of ['VIEWER', 'EDITOR']) {
          const hit = await b.shares.share({ nodeType, nodeId, email, level });
          const missing = await b.shares.share({ nodeType, nodeId: randomUUID(), email, level });
          expect({ nodeId, ...errorOf(hit) }).toEqual({ nodeId, ...NOT_FOUND });
          expect(comparable(hit)).toEqual(comparable(missing));
        }
        const list = await b.shares.accessList({ nodeType, nodeId });
        expect({ nodeId, ...errorOf(list) }).toEqual({ nodeId, ...NOT_FOUND });
      }

      expect(await shareRowsOf(a.storage.id)).toEqual(before);
      expect(await shareRowsOf(b.storage.id)).toEqual([]);
      expect(await receivedNodeIds(c)).toEqual([]);
    });

    it('ISO-7: B no puede revocar por la ruta del propietario el acceso que recibió', async () => {
      for (const shareId of Object.values(world.shareIds)) {
        const hit = await b.shares.revoke(shareId);
        const missing = await b.shares.revoke(randomUUID());

        expect(errorOf(hit)).toEqual(SHARE_NOT_FOUND);
        expect(comparable(hit)).toEqual(comparable(missing));
      }
      expect(await receivedNodeIds(b)).toHaveLength(3);
    });
  });

  it('ISO-8 (CA-17): con A suspendida, B no puede alcanzar lo compartido; al reactivarla, vuelve', async () => {
    await setStatus(a, 'suspendida');
    try {
      for (const [kind, id] of [
        ['file', world.files.direct],
        ['file', world.files.inSub],
        ['folder', world.folders.shared],
      ] as const) {
        const [label, call] = READ_PROBES[kind][0] as Probe;
        const [hit, missing] = [await call(b, id), await call(b, randomUUID())];
        expect({ label, ...comparable(hit) }).toEqual({ label, ...comparable(missing) });
        expect(errorOf(hit)).toEqual(NOT_FOUND);
      }
      expect(await receivedNodeIds(b)).toEqual([]);
    } finally {
      await setStatus(a, 'activa');
    }

    expect((await b.storage.fileDetail(world.files.direct)).status).toBe(200);
    expect(await receivedNodeIds(b)).toHaveLength(3);
  });

  describe('CA-20: roles internos y sin token', () => {
    const allRoutes = (party: Party): [string, () => Promise<Response>][] => [
      [
        'POST /shares',
        () =>
          party.shares.share({
            nodeType: 'folder',
            nodeId: world.folders.shared,
            email: 'otra@ejemplo.com',
            level: 'VIEWER',
          }),
      ],
      [
        'GET /shares',
        () => party.shares.accessList({ nodeType: 'folder', nodeId: world.folders.shared }),
      ],
      ['DELETE /shares/:id', () => party.shares.revoke(world.shareIds.folder)],
      ['GET /shares/received', () => party.shares.received()],
      ['DELETE /shares/received/:id', () => party.shares.leave(world.shareIds.folder)],
    ];

    it.each(INTERNAL_ROLES)(
      'ISO-9: %s no puede usar ninguna de las 5 rutas de `sharing` (403) ni abrir la ficha',
      async (role) => {
        const internal = await newParty(role);
        for (const [label, call] of allRoutes(internal)) {
          const response = await call();
          expect({ label, ...errorOf(response) }).toEqual({
            label,
            status: 403,
            code: 'SHARED_FORBIDDEN',
          });
          expect(JSON.stringify(response.body)).not.toContain(world.folders.shared);
        }
        const detail = await internal.storage.fileDetail(world.files.direct);
        expect(errorOf(detail)).toEqual({ status: 403, code: 'SHARED_FORBIDDEN' });
        expect(await receivedNodeIds(b)).toHaveLength(3);
      },
    );

    it('ISO-10: sin token, las 5 rutas responden 401', async () => {
      const anonymous = partyOf(sharing.storage.clientFor(randomUUID()));
      for (const [label, call] of allRoutes(anonymous)) {
        expect({ label, ...errorOf(await call()) }).toEqual({
          label,
          status: 401,
          code: 'SHARED_UNAUTHENTICATED',
        });
      }
    });
  });

  describe('CA-22, CA-23: compartidos conmigo y Salir', () => {
    it('ISO-11: C no puede salir del acceso de B; A no puede salir de su propia compartición', async () => {
      for (const party of [c, a]) {
        for (const shareId of Object.values(world.shareIds)) {
          const hit = await party.shares.leave(shareId);
          const missing = await party.shares.leave(randomUUID());

          expect(errorOf(hit)).toEqual(SHARE_NOT_FOUND);
          expect(comparable(hit)).toEqual(comparable(missing));
        }
      }
      expect(await receivedNodeIds(b)).toHaveLength(3);
      expect((await b.storage.fileDetail(world.files.direct)).status).toBe(200);
    });

    it('ISO-12: tras salir B, C tampoco puede usar ese `shareId` y B ya no alcanza el nodo', async () => {
      const { fileId } = await insertCommittedFile(sharing.storage.owner, a.storage.id);
      const shareId = await insertShare(sharing.storage.owner, {
        ownerId: a.storage.id,
        granteeId: b.storage.id,
        node: { fileId },
      });

      expect((await b.shares.leave(shareId)).status).toBe(204);

      expect(errorOf(await c.shares.leave(shareId))).toEqual(SHARE_NOT_FOUND);
      expect(errorOf(await b.shares.leave(shareId))).toEqual(SHARE_NOT_FOUND);
      expect(errorOf(await b.storage.fileDetail(fileId))).toEqual(NOT_FOUND);
    });
  });

  describe('CA-3, RN-8, R-5: destinatario no encontrado', () => {
    const KINDS = ['inexistente', 'interna', 'sin-verificar', 'suspendida'] as const;
    type Kind = (typeof KINDS)[number];
    let emails: Record<Kind, string>;
    let ids: string[];

    const shareAs = (email: string, correlationId: string): Promise<Response> =>
      request(sharing.storage.testApp.app.getHttpServer())
        .post(`${API_PREFIX}/shares`)
        .set('Authorization', `Bearer ${sharing.storage.tokenOf(a.storage.id) ?? ''}`)
        .set('X-Correlation-Id', correlationId)
        .send({ nodeType: 'folder', nodeId: world.folders.shared, email, level: 'EDITOR' });

    beforeAll(async () => {
      const [internal, unverified, suspended] = [
        await newParty(Role.SUPPORT),
        await newParty(),
        await newParty(),
      ];
      const owner = sharing.storage.owner;
      await owner.query('UPDATE usuario SET correo_verificado = false WHERE id = $1', [
        unverified.storage.id,
      ]);
      await setStatus(suspended, 'suspendida');
      const accounts = [internal, unverified, suspended].map((party) => party.storage.id);
      const [interna, sinVerificar, suspendida] = await Promise.all(
        accounts.map((id) => sharing.emailOf(id)),
      );
      emails = {
        inexistente: `nadie.${randomUUID()}@ejemplo.com`,
        interna: interna ?? '',
        'sin-verificar': sinVerificar ?? '',
        suspendida: suspendida ?? '',
      };
      ids = accounts;
    });

    it('ISO-13: los cuatro motivos dan el mismo status, cuerpo y cabeceras, sin revelar la cuenta', async () => {
      const observed = {} as Record<Kind, ReturnType<typeof observe>>;
      for (const kind of KINDS) observed[kind] = observe(await shareAs(emails[kind], 'iso-ca3'));

      expect(observed.inexistente).toMatchObject({
        status: 422,
        body: { code: 'SHARING_RECIPIENT_NOT_FOUND' },
      });
      for (const kind of KINDS) {
        expect({ kind, observed: observed[kind] }).toEqual({
          kind,
          observed: observed.inexistente,
        });
        const visible = JSON.stringify(observed[kind]);
        expect(visible).not.toContain(emails[kind]);
        for (const id of ids) expect(visible).not.toContain(id);
      }
      const rows = await sharing.storage.owner.query(
        'SELECT id FROM comparticion WHERE destinatario_id = ANY($1)',
        [ids],
      );
      expect(rows).toEqual([]);
    });

    it('ISO-14: la mediana del tiempo de respuesta no distingue los cuatro motivos', async () => {
      const samples = Object.fromEntries(KINDS.map((kind) => [kind, [] as number[]])) as Record<
        Kind,
        number[]
      >;
      for (let round = 0; round <= TIMING_ROUNDS; round += 1) {
        for (const [offset] of KINDS.entries()) {
          const kind = KINDS[(round + offset) % KINDS.length] as Kind;
          const start = performance.now();
          expect((await shareAs(emails[kind], `iso-tiempo-${String(round)}`)).status).toBe(422);
          if (round > 0) samples[kind].push(performance.now() - start);
        }
      }

      const baseline = median(samples.inexistente);
      for (const kind of KINDS) {
        const gap = Math.abs(median(samples[kind]) - baseline);
        expect({ kind, observable: gap > TIMING_TOLERANCE_MS }).toEqual({
          kind,
          observable: false,
        });
      }
    });
  });
});
