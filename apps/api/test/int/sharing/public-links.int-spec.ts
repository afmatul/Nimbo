import { createHash, randomUUID } from 'node:crypto';

import { createdPublicLinkSchema, currentPublicLinkSchema } from '@nimbo/contracts';
import type { Response } from 'supertest';

import { Role } from '../../../src/shared';
import { insertCommittedFile } from '../storage/storage-http';
import type { StorageClient } from '../storage/storage-http';
import { insertFolder } from '../storage/storage-test-db';

import { createSharingHttpApp } from './sharing-http';
import type { PublicLinksClient, SharingHttpApp } from './sharing-http';
import { insertPublicLink, insertShare } from './sharing-test-db';

const CORRELATION_HEADER = 'x-correlation-id';
/** `WEB_PUBLIC_URL` del arnés (`global-setup.ts`) y la ruta web del enlace (plan §5; la página es la 013b). */
const LINK_URL_PREFIX = 'http://localhost/enlace#';
const FILE_PREFIX = 'Contrato-confidencial-7f3a';
const PASSWORD = 'clave-del-enlace-9c2e';
const DAY_MS = 24 * 60 * 60 * 1000;
/** Holgura entre el reloj de la API y el de la prueba al comparar el vencimiento. */
const CLOCK_SLACK_MS = 60_000;
/** El límite por propietario no interfiere con los demás casos; CA-6 tiene su propia suite. */
const ROOMY_RATE_LIMIT = '1000';

interface ErrorBody {
  readonly code: string;
  readonly fields?: readonly { field: string; reason: string }[];
}

interface LinkRow {
  readonly id: string;
  readonly token_hash: string;
  readonly clave_hash: string | null;
  readonly vence_en: Date;
  readonly creado_en: Date;
  readonly revocado_en: Date | null;
}

const errorOf = (response: Response): { status: number; code: string } => ({
  status: response.status,
  code: (response.body as ErrorBody).code,
});

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** El token del fragmento de la URL entregada (la única vez que se ve, CA-1). */
const tokenOf = (response: Response): string =>
  createdPublicLinkSchema.parse(response.body).url.slice(LINK_URL_PREFIX.length);

/**
 * Rutas del propietario de `/public-links` por HTTP con Postgres, Redis y Argon2 reales (spec 013 CA-1 a CA-8, CA-15,
 * CA-16; plan §6). Ana genera, ve y revoca enlaces a sus archivos; Dani es Editora o Lectora de algunos y tiene los suyos.
 */
describe('POST, GET y DELETE /public-links (013 CA-1 a CA-8, CA-15, CA-16)', () => {
  let sharing: SharingHttpApp;
  let ana: StorageClient;
  let dani: StorageClient;
  let anaLinks: PublicLinksClient;

  const newFile = async (ownerId: string, deletedAt: Date | null = null): Promise<string> =>
    (
      await insertCommittedFile(sharing.storage.owner, ownerId, {
        name: `${FILE_PREFIX}-${randomUUID()}.pdf`,
        deletedAt,
      })
    ).fileId;

  const linkRows = (fileId: string): Promise<LinkRow[]> =>
    sharing.storage.owner.query(
      `SELECT id, token_hash, clave_hash, vence_en, creado_en, revocado_en
         FROM enlace_publico WHERE archivo_id = $1 ORDER BY creado_en, id`,
      [fileId],
    );

  const servedLinkOf = async (token: string): Promise<string[]> => {
    const rows = (await sharing.storage.owner.query('SELECT enlace_id FROM enlace_por_token($1)', [
      sha256(token),
    ])) as { enlace_id: string }[];
    return rows.map((row) => row.enlace_id);
  };

  const linkEventsOf = async (fileId: string) =>
    (await sharing.eventsOf(ana.id)).filter(
      (event) => event.recurso_id === fileId && event.accion.startsWith('public_link.'),
    );

  beforeAll(async () => {
    sharing = await createSharingHttpApp({
      env: { SHARING_RATE_LIMIT_PER_MINUTE: ROOMY_RATE_LIMIT },
    });
    [ana, dani] = [await sharing.storage.newClient(), await sharing.storage.newClient()];
    anaLinks = sharing.publicLinksOf(ana);
  });

  afterEach(() => {
    sharing.storage.limits.setReadOnly(false);
  });

  afterAll(async () => {
    await sharing?.close();
  });

  it('CA-1, CA-15: 201 con la URL (token en el fragmento), 7 días por omisión, `no-store` y `public_link.created`', async () => {
    const fileId = await newFile(ana.id);
    const before = Date.now();

    const response = await anaLinks.create({ fileId });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const { link, url } = createdPublicLinkSchema.parse(response.body);
    expect(url.startsWith(LINK_URL_PREFIX)).toBe(true);
    expect(link).toMatchObject({ fileId, hasPassword: false, status: 'active' });
    const expiresAt = new Date(link.expiresAt).getTime();
    expect(Math.abs(expiresAt - (before + 7 * DAY_MS))).toBeLessThan(CLOCK_SLACK_MS);
    const token = tokenOf(response);
    const [row] = await linkRows(fileId);
    expect(row).toMatchObject({ id: link.id, token_hash: sha256(token), clave_hash: null });
    expect(row?.revocado_en).toBeNull();
    await expect(linkEventsOf(fileId)).resolves.toEqual([
      {
        accion: 'public_link.created',
        actor_id: ana.id,
        tipo_recurso: 'file',
        recurso_id: fileId,
        atributos: { expiresInDays: 7, protection: 'none' },
        correlation_id: response.headers[CORRELATION_HEADER] as string,
      },
    ]);
  });

  it('CA-1, CA-15: con contraseña y 1 día guarda solo el hash Argon2id; bitácoras y auditoría sin token, contraseña ni nombre', async () => {
    const fileId = await newFile(ana.id);

    const response = await anaLinks.create({ fileId, expiresInDays: 1, password: PASSWORD });

    expect(response.status).toBe(201);
    const { link } = createdPublicLinkSchema.parse(response.body);
    expect(link.hasPassword).toBe(true);
    const [row] = await linkRows(fileId);
    expect(row?.clave_hash).toMatch(/^\$argon2id\$/);
    expect(row?.clave_hash).not.toContain(PASSWORD);
    expect((row?.vence_en.getTime() ?? 0) - (row?.creado_en.getTime() ?? 0)).toBe(DAY_MS);
    const events = await linkEventsOf(fileId);
    expect(events.map((event) => event.atributos)).toEqual([
      { expiresInDays: 1, protection: 'password' },
    ]);
    const logs = JSON.stringify(sharing.storage.testApp.logs.lines());
    expect(logs).toContain('public_link.created');
    const token = tokenOf(response);
    for (const written of [logs, JSON.stringify(events)]) {
      expect(written).not.toContain(token);
      expect(written).not.toContain(PASSWORD);
      expect(written).not.toContain(FILE_PREFIX);
    }
  });

  it('CA-2: un vencimiento fuera de 1, 7 o 30 o una contraseña corta es 422 con `fields` y no crea nada', async () => {
    const fileId = await newFile(ana.id);

    const response = await anaLinks.create({ fileId, expiresInDays: 14, password: 'corta' });

    expect(errorOf(response)).toEqual({ status: 422, code: 'SHARING_INVALID_REQUEST' });
    expect((response.body as ErrorBody).fields?.map((field) => field.reason).sort()).toEqual([
      'INVALID_EXPIRY',
      'INVALID_PASSWORD',
    ]);
    await expect(linkRows(fileId)).resolves.toEqual([]);
  });

  it('CA-3: carpeta, ajeno, inexistente, en la papelera o como Editora o Lectora es el 404 de lo inexistente', async () => {
    const folderId = (
      await sharing.storage.owner.transaction((manager) =>
        insertFolder(manager, ana.id, { name: `Carpeta-${randomUUID()}` }),
      )
    ).id;
    const [danisFile, trashed, edited, viewed] = [
      await newFile(dani.id),
      await newFile(ana.id, new Date()),
      await newFile(ana.id),
      await newFile(ana.id),
    ];
    for (const [fileId, level] of [
      [edited, 'EDITOR'],
      [viewed, 'VIEWER'],
    ] as const) {
      await insertShare(sharing.storage.owner, {
        ownerId: ana.id,
        granteeId: dani.id,
        node: { fileId },
        level,
      });
    }
    const daniLinks = sharing.publicLinksOf(dani);

    const responses = [
      await anaLinks.create({ fileId: folderId }),
      await anaLinks.create({ fileId: danisFile }),
      await anaLinks.create({ fileId: randomUUID() }),
      await anaLinks.create({ fileId: trashed }),
      await daniLinks.create({ fileId: edited }),
      await daniLinks.create({ fileId: viewed }),
    ];

    for (const response of responses) {
      expect(errorOf(response)).toEqual({ status: 404, code: 'STORAGE_NODE_NOT_FOUND' });
    }
    for (const fileId of [danisFile, trashed, edited, viewed]) {
      await expect(linkRows(fileId)).resolves.toEqual([]);
    }
  });

  it('CA-4, CA-15: generar otro revoca el anterior (vencido incluido): deja de servir, uno activo, `revoked` y `created`', async () => {
    const fileId = await newFile(ana.id);
    const expired = await insertPublicLink(sharing.storage.owner, {
      ownerId: ana.id,
      fileId,
      createdAt: new Date(Date.now() - 2 * DAY_MS),
      expiresAt: new Date(Date.now() - DAY_MS),
    });
    const first = await anaLinks.create({ fileId });
    const firstToken = tokenOf(first);
    await expect(servedLinkOf(firstToken)).resolves.toHaveLength(1);

    const second = await anaLinks.create({ fileId, password: PASSWORD });

    expect([first.status, second.status]).toEqual([201, 201]);
    const rows = await linkRows(fileId);
    expect(rows.map((row) => [row.id, row.revocado_en === null])).toEqual([
      [expired.id, false],
      [createdPublicLinkSchema.parse(first.body).link.id, false],
      [createdPublicLinkSchema.parse(second.body).link.id, true],
    ]);
    await expect(servedLinkOf(firstToken)).resolves.toEqual([]);
    await expect(servedLinkOf(tokenOf(second))).resolves.toHaveLength(1);
    const events = await linkEventsOf(fileId);
    expect(events.map((event) => [event.accion, event.atributos])).toEqual([
      ['public_link.revoked', { reason: 'replaced' }],
      ['public_link.created', { expiresInDays: 7, protection: 'none' }],
      ['public_link.revoked', { reason: 'replaced' }],
      ['public_link.created', { expiresInDays: 7, protection: 'password' }],
    ]);
    expect(events.slice(2).map((event) => event.correlation_id)).toEqual([
      second.headers[CORRELATION_HEADER],
      second.headers[CORRELATION_HEADER],
    ]);
    expect(JSON.stringify(sharing.storage.testApp.logs.lines())).toContain('public_link.revoked');
  });

  it('CA-4: dos `POST` simultáneos sobre el mismo archivo dan 201 los dos y dejan un solo enlace activo', async () => {
    const fileId = await newFile(ana.id);

    const responses = await Promise.all([
      anaLinks.create({ fileId }),
      anaLinks.create({ fileId }),
      anaLinks.create({ fileId }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);
    const rows = await linkRows(fileId);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.revocado_en === null)).toHaveLength(1);
  });

  it('CA-5: en solo lectura generar o reemplazar es 403 `STORAGE_ACCOUNT_READ_ONLY` y nada cambia', async () => {
    const [fresh, linked] = [await newFile(ana.id), await newFile(ana.id)];
    const existing = await anaLinks.create({ fileId: linked });
    sharing.storage.limits.setReadOnly(true);

    const responses = [
      await anaLinks.create({ fileId: fresh }),
      await anaLinks.create({ fileId: linked }),
    ];

    for (const response of responses) {
      expect(errorOf(response)).toEqual({ status: 403, code: 'STORAGE_ACCOUNT_READ_ONLY' });
    }
    await expect(linkRows(fresh)).resolves.toEqual([]);
    const rows = await linkRows(linked);
    expect(rows.map((row) => [row.id, row.revocado_en])).toEqual([
      [createdPublicLinkSchema.parse(existing.body).link.id, null],
    ]);
  });

  it('CA-16: Administrador, Soporte y Operador reciben 403 `SHARED_FORBIDDEN` al generar, ver o revocar; sin token, 401', async () => {
    const fileId = await newFile(ana.id);
    const { id: linkId } = await insertPublicLink(sharing.storage.owner, {
      ownerId: ana.id,
      fileId,
    });
    const callsOf = (links: PublicLinksClient): Promise<Response[]> =>
      Promise.all([links.create({ fileId }), links.current({ fileId }), links.revoke(linkId)]);

    for (const role of [Role.ADMIN, Role.SUPPORT, Role.OPERATOR]) {
      const internal = await sharing.storage.newClient(role);
      for (const response of await callsOf(sharing.publicLinksOf(internal))) {
        expect(errorOf(response)).toEqual({ status: 403, code: 'SHARED_FORBIDDEN' });
      }
    }
    const anonymous = sharing.publicLinksOf(sharing.storage.clientFor(randomUUID()));
    for (const response of await callsOf(anonymous)) {
      expect(errorOf(response)).toEqual({ status: 401, code: 'SHARED_UNAUTHENTICATED' });
    }
    const rows = await linkRows(fileId);
    expect(rows.map((row) => [row.id, row.revocado_en])).toEqual([[linkId, null]]);
  });

  it('CA-7: sin enlace, `{ link: null }`; con uno, su resumen con `no-store` y sin la URL ni el token', async () => {
    const fileId = await newFile(ana.id);
    const empty = await anaLinks.current({ fileId });
    const created = await anaLinks.create({ fileId, password: PASSWORD });

    const response = await anaLinks.current({ fileId });

    expect([empty.status, empty.body]).toEqual([200, { link: null }]);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const { link } = currentPublicLinkSchema.parse(response.body);
    expect(link).toEqual(createdPublicLinkSchema.parse(created.body).link);
    expect(link).toMatchObject({ hasPassword: true, status: 'active' });
    expect(JSON.stringify(response.body)).not.toContain(tokenOf(created));
  });

  it('CA-7: un enlace vencido sale `expired`; uno revocado no sale', async () => {
    const [expiredFile, revokedFile] = [await newFile(ana.id), await newFile(ana.id)];
    const expired = await insertPublicLink(sharing.storage.owner, {
      ownerId: ana.id,
      fileId: expiredFile,
      createdAt: new Date(Date.now() - 2 * DAY_MS),
      expiresAt: new Date(Date.now() - DAY_MS),
    });
    const revoked = await anaLinks.create({ fileId: revokedFile });
    await anaLinks.revoke(createdPublicLinkSchema.parse(revoked.body).link.id);

    const [expiredResponse, revokedResponse] = [
      await anaLinks.current({ fileId: expiredFile }),
      await anaLinks.current({ fileId: revokedFile }),
    ];

    expect(currentPublicLinkSchema.parse(expiredResponse.body).link).toMatchObject({
      id: expired.id,
      fileId: expiredFile,
      hasPassword: false,
      status: 'expired',
    });
    expect(revokedResponse.body).toEqual({ link: null });
  });

  it('CA-7: carpeta, ajeno, inexistente, en la papelera o como Editora o Lectora es el 404 de lo inexistente; una consulta inválida, 422', async () => {
    const folderId = (
      await sharing.storage.owner.transaction((manager) =>
        insertFolder(manager, ana.id, { name: `Carpeta-${randomUUID()}` }),
      )
    ).id;
    const [danisFile, trashed, edited, viewed] = [
      await newFile(dani.id),
      await newFile(ana.id, new Date()),
      await newFile(ana.id),
      await newFile(ana.id),
    ];
    await insertPublicLink(sharing.storage.owner, { ownerId: dani.id, fileId: danisFile });
    for (const fileId of [trashed, edited, viewed]) {
      await insertPublicLink(sharing.storage.owner, { ownerId: ana.id, fileId });
    }
    for (const [fileId, level] of [
      [edited, 'EDITOR'],
      [viewed, 'VIEWER'],
    ] as const) {
      await insertShare(sharing.storage.owner, {
        ownerId: ana.id,
        granteeId: dani.id,
        node: { fileId },
        level,
      });
    }
    const daniLinks = sharing.publicLinksOf(dani);

    const responses = [
      await anaLinks.current({ fileId: folderId }),
      await anaLinks.current({ fileId: danisFile }),
      await anaLinks.current({ fileId: randomUUID() }),
      await anaLinks.current({ fileId: trashed }),
      await daniLinks.current({ fileId: edited }),
      await daniLinks.current({ fileId: viewed }),
    ];

    for (const response of responses) {
      expect(errorOf(response)).toEqual({ status: 404, code: 'STORAGE_NODE_NOT_FOUND' });
    }
    const invalid = await anaLinks.current({ fileId: 'no-es-un-uuid' });
    expect(errorOf(invalid)).toEqual({ status: 422, code: 'SHARING_INVALID_REQUEST' });
    expect((invalid.body as ErrorBody).fields?.map((field) => field.field)).toEqual(['fileId']);
  });

  it('CA-8, CA-15: revocar da 204 con `no-store`, deja de servir y `public_link.revoked` (`revoked`) sin token, contraseña ni nombre', async () => {
    const fileId = await newFile(ana.id);
    const created = await anaLinks.create({ fileId, password: PASSWORD });
    const { id: linkId } = createdPublicLinkSchema.parse(created.body).link;
    const token = tokenOf(created);

    const response = await anaLinks.revoke(linkId);

    expect(response.status).toBe(204);
    expect(response.headers['cache-control']).toBe('no-store');
    const [row] = await linkRows(fileId);
    expect(row?.revocado_en).toBeInstanceOf(Date);
    await expect(servedLinkOf(token)).resolves.toEqual([]);
    const events = await linkEventsOf(fileId);
    expect(events.slice(1)).toEqual([
      {
        accion: 'public_link.revoked',
        actor_id: ana.id,
        tipo_recurso: 'file',
        recurso_id: fileId,
        atributos: { reason: 'revoked' },
        correlation_id: response.headers[CORRELATION_HEADER] as string,
      },
    ]);
    const logs = JSON.stringify(sharing.storage.testApp.logs.lines());
    expect(logs).toContain('public_link.revoked');
    for (const written of [logs, JSON.stringify(events)]) {
      expect(written).not.toContain(token);
      expect(written).not.toContain(PASSWORD);
      expect(written).not.toContain(FILE_PREFIX);
    }
  });

  it('CA-8, CA-5: se revoca con la cuenta en solo lectura y con el archivo en la papelera', async () => {
    const [readOnlyFile, trashedFile] = [await newFile(ana.id), await newFile(ana.id, new Date())];
    const readOnlyLink = createdPublicLinkSchema.parse(
      (await anaLinks.create({ fileId: readOnlyFile })).body,
    ).link.id;
    const trashedLink = (
      await insertPublicLink(sharing.storage.owner, { ownerId: ana.id, fileId: trashedFile })
    ).id;
    sharing.storage.limits.setReadOnly(true);

    const responses = [await anaLinks.revoke(readOnlyLink), await anaLinks.revoke(trashedLink)];

    expect(responses.map((response) => response.status)).toEqual([204, 204]);
    for (const fileId of [readOnlyFile, trashedFile]) {
      const [row] = await linkRows(fileId);
      expect(row?.revocado_en).toBeInstanceOf(Date);
      const events = await linkEventsOf(fileId);
      expect(events.at(-1)).toMatchObject({
        accion: 'public_link.revoked',
        atributos: { reason: 'revoked' },
      });
    }
  });

  it('CA-8: ajeno, inexistente, ya revocado o un id que no es UUID es 404 `SHARING_LINK_NOT_FOUND` y nada cambia', async () => {
    const [danisFile, anasFile] = [await newFile(dani.id), await newFile(ana.id)];
    const danisLink = await insertPublicLink(sharing.storage.owner, {
      ownerId: dani.id,
      fileId: danisFile,
    });
    const anasLink = createdPublicLinkSchema.parse(
      (await anaLinks.create({ fileId: anasFile })).body,
    ).link.id;
    await anaLinks.revoke(anasLink);
    const before = await linkRows(anasFile);

    const responses = [
      await anaLinks.revoke(danisLink.id),
      await anaLinks.revoke(randomUUID()),
      await anaLinks.revoke(anasLink),
      await anaLinks.revoke('no-es-un-uuid'),
    ];

    for (const response of responses) {
      expect(errorOf(response)).toEqual({ status: 404, code: 'SHARING_LINK_NOT_FOUND' });
    }
    const [danisRow] = await linkRows(danisFile);
    expect(danisRow?.revocado_en).toBeNull();
    await expect(linkRows(anasFile)).resolves.toEqual(before);
    const revocations = (await linkEventsOf(anasFile)).filter(
      (event) => event.accion === 'public_link.revoked',
    );
    expect(revocations).toHaveLength(1);
    await expect(sharing.eventsOf(dani.id)).resolves.toEqual([]);
  });
});

describe('POST /public-links con el límite de intentos (013 CA-6)', () => {
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

  it('CA-6: superado el límite, 429 `SHARED_TOO_MANY_REQUESTS` con la espera, exista o no el archivo', async () => {
    const ana = await sharing.storage.newClient();
    const links = sharing.publicLinksOf(ana);
    const { fileId } = await insertCommittedFile(sharing.storage.owner, ana.id);
    for (let i = 0; i < ATTEMPTS; i += 1) await links.create({ fileId: randomUUID() });

    const responses = [
      await links.create({ fileId }),
      await links.create({ fileId: randomUUID() }),
    ];

    for (const response of responses) {
      expect(errorOf(response)).toEqual({ status: 429, code: 'SHARED_TOO_MANY_REQUESTS' });
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    }
    const rows = (await sharing.storage.owner.query(
      'SELECT id FROM enlace_publico WHERE archivo_id = $1',
      [fileId],
    )) as unknown[];
    expect(rows).toEqual([]);
  });
});
