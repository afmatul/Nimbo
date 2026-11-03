import { randomUUID } from 'node:crypto';

import {
  createdPublicLinkSchema,
  downloadUrlSchema,
  publicLinkDetailsSchema,
} from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource, EntityManager } from 'typeorm';

import { LinkToken } from '../../src/modules/sharing/domain/link-token';
import { createActor, Role } from '../../src/shared';
import type { Actor } from '../../src/shared';
import { TransactionContext } from '../../src/shared/infrastructure/persistence/transaction-context';
import { TypeOrmTransactionRunner } from '../../src/shared/infrastructure/persistence/typeorm-transaction-runner';
import { createSharingHttpApp } from '../int/sharing/sharing-http';
import type { PublicLinkVisitor, SharingHttpApp } from '../int/sharing/sharing-http';
import { insertPublicLink, insertShare, randomTokenHash } from '../int/sharing/sharing-test-db';
import { insertCommittedFile } from '../int/storage/storage-http';
import type { StorageClient } from '../int/storage/storage-http';
import { insertAccount, insertFileWithVersion, insertFolder } from '../int/storage/storage-test-db';
import type { Queryable } from '../int/storage/storage-test-db';
import { connectTo } from '../support/database-urls';

import { comparable, INTERNAL_ROLES } from './setup/isolation-assertions';
import { RESTRICTED_OWNER_ROLE, startRestrictedOwnerDatabase } from './setup/nosuperuser-postgres';

/** `WEB_PUBLIC_URL` del arnés (`global-setup.ts`) y la ruta web del enlace (013b). */
const LINK_URL_PREFIX = 'http://localhost/enlace#';
/** Límites altos: la suite mide respuestas, no los límites de CA-6 y CA-13 (ya en las `int-spec`). */
const ROOMY_LIMITS = {
  SHARING_RATE_LIMIT_PER_MINUTE: '1000',
  PUBLIC_LINK_RATE_LIMIT_PER_MINUTE: '1000',
  RATE_LIMIT_DOWNLOAD_URL_PER_MINUTE: '1000',
};
/** A y B tienen un archivo con el mismo nombre y tamaño: nada los distingue salvo el id. */
const SAME_NAME = 'Contrato de arrendamiento.pdf';
const SAME_SIZE = 2048n;
const SECOND_OF_A = 'Nómina-reservada-7f3a.pdf';
const DETAIL_KEYS = ['expiresAt', 'name', 'requiresPassword', 'sharedBy', 'sizeBytes'];
const NOT_FOUND = { status: 404, code: 'STORAGE_NODE_NOT_FOUND' };
const LINK_NOT_FOUND = { status: 404, code: 'SHARING_LINK_NOT_FOUND' };
const FORBIDDEN = { status: 403, code: 'SHARED_FORBIDDEN' };
const RLS_ERROR = /row-level security/;
/** Columnas que devuelve `enlace_por_token()` (ADR-0039 regla 1): solo identificadores. */
const RESOLVED_COLUMNS = ['archivo_id', 'enlace_id', 'propietario_id'];

const errorOf = (response: Response) => ({
  status: response.status,
  code: (response.body as { code?: string }).code,
});

/** Lo que el visitante distingue de una respuesta: `comparable` más las cabeceras de privacidad (spec §5). */
const visibleOf = (response: Response) => ({
  ...comparable(response),
  cacheControl: response.headers['cache-control'] as string | undefined,
  referrerPolicy: response.headers['referrer-policy'] as string | undefined,
});

/** La URL firmada sin su consulta (fecha y firma cambian en cada petición): el objeto que alcanza. */
const objectPathOf = (response: Response): string =>
  new URL(downloadUrlSchema.parse(response.body).url).pathname;

const objectKeyOf = (ownerId: string, fileId: string, versionId: string): string =>
  `u/${ownerId}/${fileId}/${versionId}`;

/** Segunda versión vigente: la de `insertFileWithVersion` queda como anterior (RN-4: el visitante no la ve). */
const withNewVersion = async (m: Queryable, ownerId: string, fileId: string): Promise<string> => {
  const current = randomUUID();
  await m.query(
    `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes, creado_por, creada_en, numero)
     VALUES ($1, $2, 'carga', $3, $4, $5, now(), 2)`,
    [current, fileId, objectKeyOf(ownerId, fileId, current), String(SAME_SIZE), ownerId],
  );
  await m.query('UPDATE archivo SET version_actual_id = $2 WHERE id = $1', [fileId, current]);
  return current;
};

/** Lo de A: dos archivos y una carpeta; el primero con una versión anterior y su enlace. */
interface WorldOfA {
  readonly first: { readonly fileId: string; readonly current: string; readonly old: string };
  readonly second: string;
  readonly folder: string;
  readonly linkId: string;
  readonly token: string;
}

/**
 * Aislamiento de los enlaces públicos por HTTP (spec 013 CA-11, CA-16, CA-17; plan §6, R-1, R-2; ADR-0039): A publica
 * su primer archivo; B tiene uno de nombre y tamaño idénticos con su propio enlace; C es Lectora del primero de A y
 * Editora del segundo. El token de A solo alcanza su primer archivo, sea quien sea el que lo use y lo que traiga el
 * cuerpo. Las *fixtures* se insertan como el dueño; la app corre como `nimbo_app`.
 */
describe('aislamiento de enlaces públicos por HTTP (013 CA-17, CA-11, CA-16)', () => {
  let sharing: SharingHttpApp;
  let a: StorageClient;
  let b: StorageClient;
  let c: StorageClient;
  let world: WorldOfA;
  let ofB: { readonly fileId: string; readonly versionId: string; readonly token: string };
  let anonymous: PublicLinkVisitor;
  let unavailable: ReturnType<typeof visibleOf>;

  const linkRowsOf = (fileIds: readonly string[]): Promise<unknown[]> =>
    sharing.storage.owner.query(
      'SELECT id, archivo_id, revocado_en FROM enlace_publico WHERE archivo_id = ANY($1) ORDER BY id',
      [fileIds],
    );
  const everyFileOfA = (): string[] => [world.first.fileId, world.second];

  const publish = async (client: StorageClient, fileId: string) => {
    const response = await sharing.publicLinksOf(client).create({ fileId });
    expect(response.status).toBe(201);
    const created = createdPublicLinkSchema.parse(response.body);
    return { linkId: created.link.id, token: created.url.slice(LINK_URL_PREFIX.length) };
  };

  const seedA = async (): Promise<WorldOfA> => {
    const owner = sharing.storage.owner;
    const ids = await owner.transaction(async (m) => {
      const first = await insertFileWithVersion(m, a.id, { name: SAME_NAME, sizeBytes: SAME_SIZE });
      const current = await withNewVersion(m, a.id, first.fileId);
      const second = await insertFileWithVersion(m, a.id, { name: SECOND_OF_A });
      const folder = await insertFolder(m, a.id, { name: 'Privada' });
      await insertShare(m, { ownerId: a.id, granteeId: c.id, node: { fileId: first.fileId } });
      await insertShare(m, {
        ownerId: a.id,
        granteeId: c.id,
        node: { fileId: second.fileId },
        level: 'EDITOR',
      });
      return {
        first: { fileId: first.fileId, current, old: first.versionId },
        second: second.fileId,
        folder: folder.id,
      };
    });
    return { ...ids, ...(await publish(a, ids.first.fileId)) };
  };

  /**
   * Lo que nunca debe aparecer en lo que alcanza el token de A: lo demás de A y todo lo de B. El id de A y el de su
   * primer archivo sí van en la ruta de la URL firmada (la clave del objeto, 005); en la ficha, tampoco (CA-9).
   */
  const foreignMarkers = (): string[] => [
    world.second,
    world.folder,
    world.first.old,
    world.linkId,
    SECOND_OF_A,
    ofB.fileId,
    ofB.versionId,
    b.id,
  ];

  const expectOnlyFirstOfA = (open: Response, download: Response): void => {
    expect(open.status).toBe(200);
    const details = publicLinkDetailsSchema.parse(open.body);
    expect(Object.keys(open.body as object).sort()).toEqual(DETAIL_KEYS);
    expect({ name: details.name, sizeBytes: details.sizeBytes }).toEqual({
      name: SAME_NAME,
      sizeBytes: Number(SAME_SIZE),
    });
    expect(download.status).toBe(200);
    expect(objectPathOf(download)).toContain(
      objectKeyOf(a.id, world.first.fileId, world.first.current),
    );
    const visible = JSON.stringify([open.body, download.body]);
    for (const marker of foreignMarkers()) expect(visible).not.toContain(marker);
    const card = JSON.stringify(open.body);
    for (const marker of [a.id, world.first.fileId]) expect(card).not.toContain(marker);
  };

  beforeAll(async () => {
    sharing = await createSharingHttpApp({ env: ROOMY_LIMITS });
    [a, b, c] = [
      await sharing.storage.newClient(),
      await sharing.storage.newClient(),
      await sharing.storage.newClient(),
    ];
    await sharing.rename(a.id, 'Ana Ruiz');
    await sharing.rename(b.id, 'Beatriz Soto');
    world = await seedA();
    const fileOfB = await insertCommittedFile(sharing.storage.owner, b.id, {
      name: SAME_NAME,
      sizeBytes: SAME_SIZE,
    });
    ofB = { ...fileOfB, token: (await publish(b, fileOfB.fileId)).token };
    anonymous = sharing.visitor();
    unavailable = visibleOf(await anonymous.open({ token: LinkToken.generate().toString() }));
  });

  afterAll(async () => {
    await sharing?.close();
  });

  it('ISO-1: la referencia de no disponible es el 404 `SHARING_LINK_UNAVAILABLE` con `no-store`', () => {
    expect(unavailable).toMatchObject({
      status: 404,
      body: { code: 'SHARING_LINK_UNAVAILABLE' },
      cacheControl: 'no-store',
    });
  });

  describe('CA-17: el token de A solo alcanza su archivo', () => {
    it('ISO-2: anónimo, B y C con el token de A no pueden alcanzar otro archivo, la carpeta ni la versión anterior', async () => {
      for (const client of [undefined, b, c]) {
        const token = client === undefined ? undefined : sharing.storage.tokenOf(client.id);
        const visitor = sharing.visitor(
          token === undefined ? {} : { Authorization: `Bearer ${token}` },
        );

        expectOnlyFirstOfA(
          await visitor.open({ token: world.token }),
          await visitor.download({ token: world.token }),
        );
      }
    });

    it('ISO-3: el token de B no puede alcanzar el archivo gemelo de A, ni el de A el de B', async () => {
      const download = await anonymous.download({ token: ofB.token });

      expect(objectPathOf(download)).toContain(objectKeyOf(b.id, ofB.fileId, ofB.versionId));
      expect(JSON.stringify(download.body)).not.toContain(world.first.fileId);
      expect(objectPathOf(await anonymous.download({ token: world.token }))).not.toContain(
        ofB.fileId,
      );
    });

    it('ISO-4: un token casi igual al de A no puede alcanzar nada: es el mismo 404', async () => {
      const last = world.token.slice(-1);
      const near = [
        `${world.token.slice(0, -1)}${last === 'A' ? 'B' : 'A'}`,
        world.token.toUpperCase(),
        world.token.slice(0, -1),
        `${world.token}A`,
        LinkToken.hashOf(world.token),
      ].filter((token) => token !== world.token);
      for (const token of near) {
        expect({ token, ...visibleOf(await anonymous.open({ token })) }).toEqual({
          token,
          ...unavailable,
        });
        expect({ token, ...visibleOf(await anonymous.download({ token })) }).toEqual({
          token,
          ...unavailable,
        });
      }
    });
  });

  describe('CA-17, plan D-4: ids en el cuerpo', () => {
    const smuggled = (): Record<string, unknown>[] => [
      { fileId: world.second },
      { ownerId: a.id },
      { fileId: world.second, ownerId: a.id },
      { fileId: ofB.fileId, ownerId: b.id },
      { linkId: world.linkId },
      { folderId: world.folder },
      { versionId: world.first.old },
      { archivo_id: world.second },
    ];

    it.each(['open', 'download'] as const)(
      'ISO-5: un cuerpo de `%s` con el token de A y un id de otro recurso no puede alcanzarlo: es el 404 de CA-11',
      async (route) => {
        for (const extra of smuggled()) {
          const response = await anonymous[route]({ token: world.token, ...extra });

          expect({ extra, ...visibleOf(response) }).toEqual({ extra, ...unavailable });
          const visible = JSON.stringify(response.body);
          for (const marker of [world.second, SECOND_OF_A, ofB.fileId, world.first.old]) {
            expect(visible).not.toContain(marker);
          }
        }
      },
    );

    it('ISO-6: un id en la consulta o en un token anidado no puede desviar el token de A', async () => {
      const steered = await request(sharing.storage.testApp.app.getHttpServer())
        .post('/api/v1/public-links/download')
        .query({ fileId: world.second, ownerId: a.id })
        .send({ token: world.token });
      const nested = await anonymous.download({
        token: { value: world.token, fileId: world.second },
      });
      const array = await anonymous.open({ token: [world.token, ofB.token] });

      expect(objectPathOf(steered)).toContain(
        objectKeyOf(a.id, world.first.fileId, world.first.current),
      );
      expect(visibleOf(nested)).toEqual(unavailable);
      expect(visibleOf(array)).toEqual(unavailable);
    });

    it('ISO-7: con solo el token, A sigue sirviendo su primer archivo (control de ISO-5)', async () => {
      expectOnlyFirstOfA(
        await anonymous.open({ token: world.token }),
        await anonymous.download({ token: world.token }),
      );
    });
  });

  describe('CA-17, RN-1: nadie más administra el enlace de A', () => {
    it('ISO-8: B no puede ver el enlace del archivo de A: el mismo 404 que con un id inexistente', async () => {
      const links = sharing.publicLinksOf(b);
      for (const fileId of everyFileOfA()) {
        const [hit, missing] = [
          await links.current({ fileId }),
          await links.current({ fileId: randomUUID() }),
        ];

        expect({ fileId, ...errorOf(hit) }).toEqual({ fileId, ...NOT_FOUND });
        expect(comparable(hit)).toEqual(comparable(missing));
        expect(JSON.stringify(hit.body)).not.toContain(world.linkId);
      }
    });

    it('ISO-9: B no puede revocar el enlace de A: el mismo 404 que con un id inexistente, y sigue sirviendo', async () => {
      const links = sharing.publicLinksOf(b);
      const before = await linkRowsOf(everyFileOfA());

      const [hit, missing] = [await links.revoke(world.linkId), await links.revoke(randomUUID())];

      expect(errorOf(hit)).toEqual(LINK_NOT_FOUND);
      expect(comparable(hit)).toEqual(comparable(missing));
      expect(await linkRowsOf(everyFileOfA())).toEqual(before);
      expect((await anonymous.open({ token: world.token })).status).toBe(200);
    });

    it('ISO-10: B no puede generar un enlace sobre los archivos de A ni reemplazar el vigente', async () => {
      const links = sharing.publicLinksOf(b);
      const before = await linkRowsOf(everyFileOfA());
      for (const fileId of everyFileOfA()) {
        const [hit, missing] = [
          await links.create({ fileId }),
          await links.create({ fileId: randomUUID() }),
        ];

        expect({ fileId, ...errorOf(hit) }).toEqual({ fileId, ...NOT_FOUND });
        expect(comparable(hit)).toEqual(comparable(missing));
      }

      expect(await linkRowsOf(everyFileOfA())).toEqual(before);
      expect((await anonymous.open({ token: world.token })).status).toBe(200);
    });

    it('ISO-11: C (Lectora del primero, Editora del segundo) no puede generar, ver ni revocar enlaces de A', async () => {
      const links = sharing.publicLinksOf(c);
      const before = await linkRowsOf(everyFileOfA());
      for (const fileId of everyFileOfA()) {
        expect({ fileId, ...errorOf(await links.create({ fileId })) }).toEqual({
          fileId,
          ...NOT_FOUND,
        });
        expect({ fileId, ...errorOf(await links.current({ fileId })) }).toEqual({
          fileId,
          ...NOT_FOUND,
        });
      }
      expect(errorOf(await links.revoke(world.linkId))).toEqual(LINK_NOT_FOUND);

      expect((await c.fileDetail(world.second)).status).toBe(200);
      expect(await linkRowsOf(everyFileOfA())).toEqual(before);
    });

    it.each(INTERNAL_ROLES)(
      'ISO-12: %s no puede generar, ver ni revocar el enlace de A, ni obtiene sus datos',
      async (role) => {
        const links = sharing.publicLinksOf(await sharing.storage.newClient(role));
        const before = await linkRowsOf(everyFileOfA());
        const calls: [string, () => Promise<Response>][] = [
          ['POST', () => links.create({ fileId: world.first.fileId })],
          ['GET', () => links.current({ fileId: world.first.fileId })],
          ['DELETE', () => links.revoke(world.linkId)],
        ];
        for (const [label, call] of calls) {
          const response = await call();

          expect({ label, ...errorOf(response) }).toEqual({ label, ...FORBIDDEN });
          const visible = JSON.stringify(response.body);
          for (const marker of [world.linkId, world.token, a.id, SAME_NAME]) {
            expect(visible).not.toContain(marker);
          }
        }
        expect(await linkRowsOf(everyFileOfA())).toEqual(before);
      },
    );
  });

  describe('CA-16: las rutas del visitante no usan la sesión', () => {
    const sessions = async (): Promise<[string, Record<string, string>][]> => {
      const bearer = (client: StorageClient): Record<string, string> => ({
        Authorization: `Bearer ${sharing.storage.tokenOf(client.id) ?? ''}`,
      });
      const internals = await Promise.all(
        INTERNAL_ROLES.map(
          async (role) =>
            [role, bearer(await sharing.storage.newClient(role))] as [
              string,
              Record<string, string>,
            ],
        ),
      );
      return [
        ['B', bearer(b)],
        ['A (propietaria)', bearer(a)],
        ...internals,
        ['JWT inválido', { Authorization: 'Bearer no-es-un-jwt' }],
        [
          'JWT con firma ajena',
          { Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.firma' },
        ],
        ['esquema vacío', { Authorization: 'Bearer ' }],
      ];
    };

    it('ISO-13: con la sesión de otro cliente, de un interno o un token inválido, abrir y descargar responden igual que anónimo', async () => {
      const expected = {
        open: visibleOf(await anonymous.open({ token: world.token })),
        download: objectPathOf(await anonymous.download({ token: world.token })),
      };
      for (const [label, headers] of await sessions()) {
        const visitor = sharing.visitor(headers);
        const download = await visitor.download({ token: world.token });

        expect({ label, open: visibleOf(await visitor.open({ token: world.token })) }).toEqual({
          label,
          open: expected.open,
        });
        expect({ label, status: download.status, path: objectPathOf(download) }).toEqual({
          label,
          status: 200,
          path: expected.download,
        });
      }
    });

    it('ISO-14: ninguna sesión puede hacer que un token no disponible o un cuerpo con ids responda distinto', async () => {
      const bodies = [
        { token: LinkToken.generate().toString() },
        { token: world.token, fileId: world.second },
      ];
      for (const [label, headers] of await sessions()) {
        const visitor = sharing.visitor(headers);
        for (const body of bodies) {
          expect({ label, ...visibleOf(await visitor.open(body)) }).toEqual({
            label,
            ...unavailable,
          });
          expect({ label, ...visibleOf(await visitor.download(body)) }).toEqual({
            label,
            ...unavailable,
          });
        }
      }
    });
  });
});

/** Una fila de `enlace_por_token()`. */
interface ResolvedRow {
  readonly enlace_id: string;
  readonly archivo_id: string;
  readonly propietario_id: string;
}

/**
 * La barrera de la base (spec 013 CA-17; plan §3, §6; ADR-0039 reglas 1, 2 y 6) con un dueño **sin** `SUPERUSER`
 * (ADR-0021): así `SECURITY DEFINER` de `enlace_por_token()` queda sometido a `FORCE` y a su política `TO CURRENT_USER`,
 * como en producción. Las cuentas se insertan como el dueño; archivos y enlaces, como `nimbo_app` dentro de `withActor`.
 */
describe('RLS de enlaces públicos y `enlace_por_token()` con dueño NOSUPERUSER (013 CA-17; ADR-0039)', () => {
  let database: Awaited<ReturnType<typeof startRestrictedOwnerDatabase>>;
  let owner: DataSource;
  let app: DataSource;
  let transactions: TypeOrmTransactionRunner;
  let context: TransactionContext;
  let a: Actor;
  let b: Actor;
  let c: Actor;
  let links: {
    readonly ofA: { readonly id: string; readonly tokenHash: string; readonly fileId: string };
    readonly ofB: { readonly id: string; readonly tokenHash: string; readonly fileId: string };
    readonly revoked: { readonly id: string; readonly tokenHash: string };
    readonly expired: string;
  };
  let secondOfA: string;

  const asActor = <T>(actor: Actor, work: (m: EntityManager) => Promise<T>): Promise<T> =>
    transactions.withActor(actor, () => work(context.requireActorScope(actor)));

  /** Corre `work` como `actor` y revierte siempre: los intentos no dejan filas aunque la base los acepte. */
  const attemptAs = async <T>(actor: Actor, work: (m: EntityManager) => Promise<T>): Promise<T> => {
    const rollback = new Error('rollback');
    let result: T | undefined;
    try {
      await asActor(actor, async (m) => {
        result = await work(m);
        throw rollback;
      });
    } catch (error: unknown) {
      if (error !== rollback) throw error;
    }
    return result as T;
  };

  const newActor = async (role: Role = Role.CLIENT): Promise<Actor> =>
    createActor(await insertAccount(owner, role), role);

  /** Como `nimbo_app` sin `app.actor_id`: el camino del visitante antes de derivar al propietario. */
  const resolveWithoutActor = (tokenHash: string): Promise<ResolvedRow[]> =>
    app.query('SELECT * FROM enlace_por_token($1)', [tokenHash]);

  const linkIdsVisibleTo = async (actor: Actor): Promise<string[]> => {
    const rows = (await asActor(actor, (m) =>
      m.query('SELECT id FROM enlace_publico ORDER BY id'),
    )) as { id: string }[];
    return rows.map((row) => row.id);
  };

  const publishAs = async (actor: Actor, options: { createdAt?: Date; expiresAt?: Date } = {}) =>
    asActor(actor, async (m) => {
      const { fileId } = await insertFileWithVersion(m, actor.id);
      return { fileId, ...(await insertPublicLink(m, { ownerId: actor.id, fileId, ...options })) };
    });

  beforeAll(async () => {
    database = await startRestrictedOwnerDatabase();
    owner = await connectTo(database.ownerUrl);
    app = await connectTo(database.appUrl);
    context = new TransactionContext(app);
    transactions = new TypeOrmTransactionRunner(app, context);
    [a, b, c] = [await newActor(), await newActor(), await newActor()];
    const day = 24 * 60 * 60 * 1000;
    const ofA = await publishAs(a);
    const revoked = await publishAs(a);
    await asActor(a, (m) =>
      m.query('UPDATE enlace_publico SET revocado_en = now() WHERE id = $1', [revoked.id]),
    );
    const expired = await publishAs(a, {
      createdAt: new Date(Date.now() - 2 * day),
      expiresAt: new Date(Date.now() - day),
    });
    links = {
      ofA,
      ofB: await publishAs(b),
      revoked: { id: revoked.id, tokenHash: revoked.tokenHash },
      expired: expired.tokenHash,
    };
    secondOfA = (await asActor(a, (m) => insertFileWithVersion(m, a.id))).fileId;
    await asActor(a, (m) =>
      insertShare(m, { ownerId: a.id, granteeId: c.id, node: { fileId: ofA.fileId } }),
    );
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await database?.stop();
  });

  describe('sin actor y entre cuentas, sin filtro en la consulta', () => {
    it('ISO-15: `nimbo_app` sin actor no puede leer ninguna fila de `enlace_publico`', async () => {
      expect(await app.query('SELECT id FROM enlace_publico')).toEqual([]);
      expect(
        await transactions.run(() => context.manager().query('SELECT id FROM enlace_publico')),
      ).toEqual([]);
    });

    it('ISO-16: B no puede leer los enlaces de A y A no puede leer los de B', async () => {
      const ofA = await linkIdsVisibleTo(a);

      expect(await linkIdsVisibleTo(b)).toEqual([links.ofB.id]);
      expect(ofA).toHaveLength(3);
      expect(ofA).not.toContain(links.ofB.id);
    });

    it.each(INTERNAL_ROLES)(
      'ISO-17: %s no puede leer ninguna fila de `enlace_publico`',
      async (role) => {
        expect(await linkIdsVisibleTo(await newActor(role))).toEqual([]);
      },
    );

    it('ISO-18: B y C no pueden revocar por SQL el enlace de A: 0 filas cambiadas', async () => {
      for (const actor of [b, c]) {
        const changed = await attemptAs(actor, (m) =>
          m.query(
            `WITH cambio AS (UPDATE enlace_publico SET revocado_en = now() WHERE id = $1 RETURNING id)
             SELECT id FROM cambio`,
            [links.ofA.id],
          ),
        );
        expect(changed).toEqual([]);
      }
      expect(await resolveWithoutActor(links.ofA.tokenHash)).toHaveLength(1);
    });

    it('ISO-19: B y C (Lectora) no pueden crear por SQL un enlace sobre un archivo de A, a su nombre ni al de A', async () => {
      for (const actor of [b, c]) {
        for (const ownerId of [actor.id, a.id]) {
          await expect(
            attemptAs(actor, (m) => insertPublicLink(m, { ownerId, fileId: secondOfA })),
          ).rejects.toThrow(RLS_ERROR);
        }
      }
    });

    it('ISO-20: `nimbo_app` no puede cambiar a qué archivo, cuenta o hash apunta un enlace, ni borrarlo', async () => {
      for (const sql of [
        'UPDATE enlace_publico SET archivo_id = $2 WHERE id = $1',
        'UPDATE enlace_publico SET propietario_id = $2 WHERE id = $1',
        'UPDATE enlace_publico SET token_hash = $2 WHERE id = $1',
      ]) {
        await expect(
          attemptAs(a, (m) =>
            m.query(sql, [links.ofA.id, sql.includes('token') ? randomTokenHash() : secondOfA]),
          ),
        ).rejects.toThrow(/permission denied/);
      }
      await expect(
        attemptAs(a, (m) => m.query('DELETE FROM enlace_publico WHERE id = $1', [links.ofA.id])),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe('revocar es irreversible (013 CA-8, RN-3)', () => {
    const changedIdsSql = (assignment: string): string =>
      `WITH cambio AS (UPDATE enlace_publico SET ${assignment} WHERE id = $1 RETURNING id)
       SELECT id FROM cambio`;

    it('ISO-27: A puede revocar por SQL su enlace vigente', async () => {
      const changed = await attemptAs(a, (m) =>
        m.query(changedIdsSql('revocado_en = now()'), [links.ofA.id]),
      );

      expect(changed).toEqual([{ id: links.ofA.id }]);
      expect(await resolveWithoutActor(links.ofA.tokenHash)).toHaveLength(1);
    });

    it('ISO-28: A no puede des-revocar por SQL su enlace revocado: `revocado_en` no vuelve a `NULL`', async () => {
      await expect(
        attemptAs(a, (m) => m.query(changedIdsSql('revocado_en = NULL'), [links.revoked.id])),
      ).rejects.toThrow(RLS_ERROR);
      await expect(
        attemptAs(a, async (m) => {
          await m.query(changedIdsSql('revocado_en = now()'), [links.ofA.id]);
          return m.query(changedIdsSql('revocado_en = NULL'), [links.ofA.id]);
        }),
      ).rejects.toThrow(RLS_ERROR);

      expect(await resolveWithoutActor(links.revoked.tokenHash)).toEqual([]);
      expect(await resolveWithoutActor(links.ofA.tokenHash)).toHaveLength(1);
    });
  });

  describe('`enlace_por_token()`: la única puerta sin actor', () => {
    it('ISO-21: sin actor, devuelve una fila de exactamente 3 identificadores, y solo la de su hash', async () => {
      const ofA = await resolveWithoutActor(links.ofA.tokenHash);
      const ofB = await resolveWithoutActor(links.ofB.tokenHash);

      expect(ofA).toEqual([
        { enlace_id: links.ofA.id, archivo_id: links.ofA.fileId, propietario_id: a.id },
      ]);
      expect(Object.keys(ofA[0] ?? {}).sort()).toEqual(RESOLVED_COLUMNS);
      expect(ofB).toEqual([
        { enlace_id: links.ofB.id, archivo_id: links.ofB.fileId, propietario_id: b.id },
      ]);
    });

    it('ISO-22: no puede devolver nada para un hash revocado, vencido, ajeno, parcial o con otra caja', async () => {
      const hash = links.ofA.tokenHash;
      const flipped = `${hash.slice(0, -1)}${hash.endsWith('0') ? '1' : '0'}`;
      for (const probe of [
        links.revoked.tokenHash,
        links.expired,
        randomTokenHash(),
        flipped,
        hash.slice(0, 63),
        hash.toUpperCase(),
        '%',
        '',
      ]) {
        expect({ probe, rows: await resolveWithoutActor(probe) }).toEqual({ probe, rows: [] });
      }
    });

    it('ISO-23: nadie puede pedirle más que una fila: un parámetro `char(64)`, `SECURITY DEFINER`, `search_path` cerrado y del dueño', async () => {
      const [fn] = (await owner.query(
        `SELECT pg_get_function_identity_arguments(p.oid) AS argumentos,
                pg_get_function_result(p.oid) AS resultado,
                p.prosecdef, p.provolatile, p.proconfig, pg_get_userbyid(p.proowner) AS dueno,
                strpos(p.prosrc, 'e.revocado_en IS NULL AND e.vence_en > now()') > 0 AS filtra
           FROM pg_proc p WHERE p.proname = 'enlace_por_token'`,
      )) as unknown[];

      expect(fn).toEqual({
        argumentos: 'p_token_hash character',
        resultado: 'TABLE(enlace_id uuid, archivo_id uuid, propietario_id uuid)',
        prosecdef: true,
        provolatile: 's',
        proconfig: ['search_path=pg_catalog, pg_temp'],
        dueno: RESTRICTED_OWNER_ROLE,
        filtra: true,
      });
    });

    it('ISO-24: PUBLIC no puede ejecutar `enlace_por_token()`: solo `nimbo_app` y el dueño', async () => {
      const grantees = (await owner.query(
        `SELECT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END AS rol, x.privilege_type
           FROM pg_proc p, aclexplode(p.proacl) x WHERE p.proname = 'enlace_por_token' ORDER BY 1`,
      )) as unknown[];

      expect(grantees).toEqual(
        [
          { rol: 'nimbo_app', privilege_type: 'EXECUTE' },
          { rol: RESTRICTED_OWNER_ROLE, privilege_type: 'EXECUTE' },
        ].sort((x, y) => x.rol.localeCompare(y.rol)),
      );
    });

    it('ISO-25: las políticas de `enlace_publico` son del dueño (`SELECT` de lo disponible) y de `nimbo_app` (el propietario lee, crea y solo revoca), con `FORCE`', async () => {
      const policies = (await owner.query(
        `SELECT policyname, cmd, roles::text[] AS roles, qual, with_check
           FROM pg_policies WHERE tablename = 'enlace_publico' ORDER BY policyname`,
      )) as {
        policyname: string;
        cmd: string;
        roles: string[];
        qual: string;
        with_check: string;
      }[];
      const [table] = (await owner.query(
        `SELECT relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) AS dueno
           FROM pg_class WHERE relname = 'enlace_publico'`,
      )) as unknown[];

      expect(policies.map(({ policyname, cmd, roles }) => ({ policyname, cmd, roles }))).toEqual([
        { policyname: 'enlace_publico_por_token', cmd: 'SELECT', roles: [RESTRICTED_OWNER_ROLE] },
        { policyname: 'enlace_publico_propietario', cmd: 'SELECT', roles: ['nimbo_app'] },
        { policyname: 'enlace_publico_propietario_crear', cmd: 'INSERT', roles: ['nimbo_app'] },
        { policyname: 'enlace_publico_propietario_revocar', cmd: 'UPDATE', roles: ['nimbo_app'] },
      ]);
      expect(policies[0]?.qual).toMatch(/revocado_en IS NULL.*vence_en > now\(\)/s);
      expect(policies[1]?.qual).toContain('nimbo_actor_id()');
      expect(policies[3]?.with_check).toContain('revocado_en IS NOT NULL');
      expect(table).toEqual({
        relrowsecurity: true,
        relforcerowsecurity: true,
        dueno: RESTRICTED_OWNER_ROLE,
      });
    });

    it('ISO-26: sin la política `enlace_publico_por_token`, la función no puede devolver filas (falla cerrada)', async () => {
      const [policy] = (await owner.query(
        `SELECT qual FROM pg_policies WHERE policyname = 'enlace_publico_por_token'`,
      )) as { qual: string }[];
      expect(await resolveWithoutActor(links.ofA.tokenHash)).toHaveLength(1);

      await owner.query('DROP POLICY enlace_publico_por_token ON enlace_publico');
      try {
        expect(await resolveWithoutActor(links.ofA.tokenHash)).toEqual([]);
        expect(await resolveWithoutActor(links.ofB.tokenHash)).toEqual([]);
      } finally {
        await owner.query(
          `CREATE POLICY enlace_publico_por_token ON enlace_publico FOR SELECT TO CURRENT_USER USING (${policy?.qual ?? 'false'})`,
        );
      }

      expect(await resolveWithoutActor(links.ofA.tokenHash)).toHaveLength(1);
    });
  });
});
