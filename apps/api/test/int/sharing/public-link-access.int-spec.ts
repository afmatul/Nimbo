import { randomUUID } from 'node:crypto';

import {
  completeUploadResponseSchema,
  createdPublicLinkSchema,
  DOWNLOAD_URL_TTL_SECONDS,
  downloadUrlSchema,
  listAuditEventsResponseSchema,
  PUBLIC_LINK_PASSWORD_MAX_LENGTH,
  publicLinkDetailsSchema,
} from '@nimbo/contracts';
import type { Response } from 'supertest';

import { LinkToken } from '../../../src/modules/sharing/domain/link-token';
import { FixedClock, I_CLOCK, I_PASSWORD_HASHER, Role } from '../../../src/shared';
import type { IPasswordHasher } from '../../../src/shared';
import { PROBE_CLOCK_START } from '../../support/probe.module';
import { insertCommittedFile, otherBytes } from '../storage/storage-http';
import type { StorageClient } from '../storage/storage-http';

import { createSharingHttpApp } from './sharing-http';
import type { PublicLinkVisitor, SharingHttpApp } from './sharing-http';
import { insertPublicLink } from './sharing-test-db';

/** `WEB_PUBLIC_URL` del arnés (`global-setup.ts`) y la ruta web del enlace (la página es la 013b). */
const LINK_URL_PREFIX = 'http://localhost/enlace#';
const FILE_PREFIX = 'Balance-reservado-5d1c';
const SIZE_BYTES = 4096n;
const OWNER_NAME = 'Ana Ruiz';
const PASSWORD = 'clave-del-enlace-9c2e';
const UNAVAILABLE = 'SHARING_LINK_UNAVAILABLE';
const DAY_MS = 24 * 60 * 60 * 1000;
const DOWNLOAD_BYTES = 3000;
const MS_PER_SECOND = 1000;
/** Holgura entre el reloj de la prueba y el de la API al comparar `expiresAt`. */
const CLOCK_SLACK_MS = 30_000;
/** Ni el límite por propietario ni el de red interfieren con los demás casos; CA-14 tiene su propia app. */
const ROOMY_RATE_LIMIT = '1000';

interface ErrorBody {
  readonly code: string;
  readonly message: string;
}

/** Lo que el visitante puede comparar entre dos respuestas (el `correlationId` cambia en cada una). */
const visibleErrorOf = (response: Response) => ({
  status: response.status,
  code: (response.body as ErrorBody).code,
  message: (response.body as ErrorBody).message,
  cacheControl: response.headers['cache-control'] as string | undefined,
});

const tokenOf = (response: Response): string =>
  createdPublicLinkSchema.parse(response.body).url.slice(LINK_URL_PREFIX.length);

/**
 * `POST /public-links/open` y `/download` por HTTP con Postgres, Redis, MinIO y la función `enlace_por_token()` reales
 * (spec 013 CA-9 a CA-11, CA-14 a CA-16, CA-18; plan §6, ADR-0039). Ana comparte; el visitante no tiene sesión.
 */
describe('POST /public-links/open y /download (013 CA-9 a CA-11, CA-14 a CA-16, CA-18)', () => {
  let sharing: SharingHttpApp;
  let ana: StorageClient;
  let anonymous: PublicLinkVisitor;
  let unavailableReference: ReturnType<typeof visibleErrorOf>;

  const newFile = async (): Promise<string> =>
    (
      await insertCommittedFile(sharing.storage.owner, ana.id, {
        name: `${FILE_PREFIX}-${randomUUID()}.pdf`,
        sizeBytes: SIZE_BYTES,
      })
    ).fileId;

  const newLink = async (body: Record<string, unknown> = {}) => {
    const fileId = await newFile();
    const response = await sharing.publicLinksOf(ana).create({ fileId, ...body });
    expect(response.status).toBe(201);
    return {
      fileId,
      token: tokenOf(response),
      link: createdPublicLinkSchema.parse(response.body).link,
    };
  };

  const expectUnavailable = (response: Response): void => {
    expect(visibleErrorOf(response)).toEqual(unavailableReference);
  };

  const setOwnerStatus = (status: string): Promise<unknown> =>
    sharing.storage.owner.query('UPDATE usuario SET estado = $2 WHERE id = $1', [ana.id, status]);

  const setTrashed = (fileId: string, trashed: boolean): Promise<unknown> =>
    sharing.storage.owner.query(
      trashed
        ? "UPDATE archivo SET eliminado_en = now(), purgar_en = now() + interval '30 days' WHERE id = $1"
        : 'UPDATE archivo SET eliminado_en = NULL, purgar_en = NULL WHERE id = $1',
      [fileId],
    );

  beforeAll(async () => {
    sharing = await createSharingHttpApp({
      env: {
        SHARING_RATE_LIMIT_PER_MINUTE: ROOMY_RATE_LIMIT,
        PUBLIC_LINK_RATE_LIMIT_PER_MINUTE: ROOMY_RATE_LIMIT,
      },
    });
    ana = await sharing.storage.newClient();
    await sharing.rename(ana.id, OWNER_NAME);
    anonymous = sharing.visitor();
    unavailableReference = visibleErrorOf(
      await anonymous.open({ token: LinkToken.generate().toString() }),
    );
  });

  afterEach(async () => {
    sharing.storage.limits.setReadOnly(false);
    await setOwnerStatus('activa');
  });

  afterAll(async () => {
    await sharing?.close();
  });

  it('CA-11: la referencia es el 404 `SHARING_LINK_UNAVAILABLE` con `no-store`', () => {
    expect(unavailableReference).toEqual({
      status: 404,
      code: UNAVAILABLE,
      message: 'Este enlace ya no está disponible. Pide a quien te lo compartió uno nuevo.',
      cacheControl: 'no-store',
    });
  });

  it('CA-9: sin sesión, la ficha con nombre, tamaño, quien comparte, vencimiento y si pide contraseña; nada más', async () => {
    const { fileId, token, link } = await newLink({ password: PASSWORD });

    const response = await anonymous.open({ token });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    const details = publicLinkDetailsSchema.parse(response.body);
    expect(details).toEqual({
      name: expect.stringMatching(new RegExp(`^${FILE_PREFIX}-`)) as unknown as string,
      sizeBytes: Number(SIZE_BYTES),
      sharedBy: { displayName: OWNER_NAME },
      expiresAt: link.expiresAt,
      requiresPassword: true,
    });
    const raw = JSON.stringify(response.body);
    for (const id of [fileId, link.id, ana.id]) expect(raw).not.toContain(id);
  });

  it('CA-9: sin contraseña, `requiresPassword` es `false`', async () => {
    const { token } = await newLink();

    const response = await anonymous.open({ token });

    expect(publicLinkDetailsSchema.parse(response.body).requiresPassword).toBe(false);
  });

  it('CA-16: con la sesión de otro cliente, de un interno o un token inválido responde igual que sin ella', async () => {
    const { token } = await newLink();
    const bea = await sharing.storage.newClient();
    const admin = await sharing.storage.newClient(Role.ADMIN);
    const expected = (await anonymous.open({ token })).body as unknown;

    for (const authorization of [
      `Bearer ${sharing.storage.tokenOf(bea.id) ?? ''}`,
      `Bearer ${sharing.storage.tokenOf(admin.id) ?? ''}`,
      'Bearer no-es-un-jwt',
    ]) {
      const response = await sharing.visitor({ Authorization: authorization }).open({ token });
      expect({ status: response.status, body: response.body as unknown }).toEqual({
        status: 200,
        body: expected,
      });
    }
  });

  it('CA-14: con la cuenta propietaria en solo lectura el enlace sigue sirviendo', async () => {
    const { token } = await newLink();
    sharing.storage.limits.setReadOnly(true);

    const response = await anonymous.open({ token });

    expect(response.status).toBe(200);
  });

  describe('CA-11: el mismo 404 con el mismo cuerpo en todos los motivos', () => {
    it.each([
      ['un token mal formado', { token: 'no-es-un-token' }],
      ['un token vacío', { token: '' }],
      ['un cuerpo sin token', {}],
      ['un token que no es texto', { token: 42 }],
      ['un cuerpo que no es un objeto', ['token']],
    ])('plan D-4: %s', async (_, body) => {
      expectUnavailable(await anonymous.open(body));
    });

    it('CA-17, plan D-4: un campo de más (`fileId`, `ownerId`) con un token válido', async () => {
      const { fileId, token } = await newLink();

      for (const extra of [{ fileId }, { ownerId: ana.id }]) {
        expectUnavailable(await anonymous.open({ token, ...extra }));
      }
      expect((await anonymous.open({ token })).status).toBe(200);
    });

    it('revocado', async () => {
      const { token, link } = await newLink();
      expect((await sharing.publicLinksOf(ana).revoke(link.id)).status).toBe(204);

      expectUnavailable(await anonymous.open({ token }));
    });

    it('reemplazado: el anterior deja de servir y el nuevo sirve', async () => {
      const { fileId, token } = await newLink();
      const replacement = await sharing.publicLinksOf(ana).create({ fileId });

      expectUnavailable(await anonymous.open({ token }));
      expect((await anonymous.open({ token: tokenOf(replacement) })).status).toBe(200);
    });

    it('vencido', async () => {
      const fileId = await newFile();
      const token = LinkToken.generate();
      const now = Date.now();
      await insertPublicLink(sharing.storage.owner, {
        ownerId: ana.id,
        fileId,
        tokenHash: token.hash(),
        createdAt: new Date(now - 2 * DAY_MS),
        expiresAt: new Date(now - DAY_MS),
      });

      expectUnavailable(await anonymous.open({ token: token.toString() }));
    });

    it('archivo en la papelera; al restaurarlo vuelve a servir', async () => {
      const { fileId, token } = await newLink();
      await setTrashed(fileId, true);

      expectUnavailable(await anonymous.open({ token }));

      await setTrashed(fileId, false);
      expect((await anonymous.open({ token })).status).toBe(200);
    });

    it('propietario suspendido; al reactivarlo vuelve a servir', async () => {
      const { token } = await newLink();
      await setOwnerStatus('suspendida');

      expectUnavailable(await anonymous.open({ token }));

      await setOwnerStatus('activa');
      expect((await anonymous.open({ token })).status).toBe(200);
    });

    it('archivo purgado: el enlace desaparece', async () => {
      const { fileId, token } = await newLink();
      await sharing.storage.owner.query('DELETE FROM archivo WHERE id = $1', [fileId]);

      expectUnavailable(await anonymous.open({ token }));
      const rows = (await sharing.storage.owner.query(
        'SELECT count(*)::int AS n FROM enlace_publico WHERE archivo_id = $1',
        [fileId],
      )) as { n: number }[];
      expect(rows[0]?.n).toBe(0);
    });
  });

  it('CA-15: las bitácoras no llevan el token ni el nombre del archivo; `public_link.unavailable` solo ids', async () => {
    const { fileId, token, link } = await newLink();
    await setTrashed(fileId, true);

    const response = await anonymous.open({ token });

    const lines = sharing.storage.testApp.logs.withCorrelationId(
      response.headers['x-correlation-id'] as string,
    );
    const logs = JSON.stringify(lines);
    expect(logs).not.toContain(token);
    expect(logs).not.toContain(FILE_PREFIX);
    expect(lines).toContainEqual(
      expect.objectContaining({ event: 'public_link.unavailable', linkId: link.id, fileId }),
    );
  });
  describe('POST /public-links/download (013 CA-10, CA-11, CA-14, CA-15, CA-18)', () => {
    /** Sube una versión y la reemplaza, así la vigente (la segunda) se distingue de la anterior por sus bytes. */
    const uploadTwoVersions = async (): Promise<{ fileId: string; current: Buffer }> => {
      const name = `${FILE_PREFIX}-${randomUUID()}.bin`;
      const first = await ana.upload(name, otherBytes(DOWNLOAD_BYTES));
      const current = otherBytes(DOWNLOAD_BYTES);
      const second = await ana.upload(name, current, 'replace');
      const fileId = completeUploadResponseSchema.parse(first.body).file.id;
      expect(completeUploadResponseSchema.parse(second.body).file.id).toBe(fileId);
      return { fileId, current };
    };

    const downloadOk = async (body: Record<string, unknown>) => {
      const response = await anonymous.download(body);
      expect(response.status).toBe(200);
      return { response, issued: downloadUrlSchema.parse(response.body) };
    };

    it('CA-10: sin contraseña, URL de 5 minutos a la versión vigente con descarga forzada; nada más', async () => {
      const { fileId, current } = await uploadTwoVersions();
      const created = await sharing.publicLinksOf(ana).create({ fileId });
      const before = Date.now();

      const { response, issued } = await downloadOk({ token: tokenOf(created) });

      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(Object.keys(response.body as object).sort()).toEqual(['expiresAt', 'url']);
      const signed = new URL(issued.url);
      expect(signed.searchParams.get('X-Amz-Expires')).toBe(String(DOWNLOAD_URL_TTL_SECONDS));
      expect(signed.host).toBe(sharing.storage.publicHost);
      const expected = before + DOWNLOAD_URL_TTL_SECONDS * MS_PER_SECOND;
      expect(Math.abs(new Date(issued.expiresAt).getTime() - expected)).toBeLessThan(
        CLOCK_SLACK_MS,
      );
      const object = await fetch(issued.url);
      expect(object.headers.get('content-disposition')).toMatch(/^attachment;/);
      expect(Buffer.from(await object.arrayBuffer())).toEqual(current);
    });

    it('CA-10: con la contraseña correcta, la URL', async () => {
      const { token } = await newLink({ password: PASSWORD });

      await downloadOk({ token, password: PASSWORD });
    });

    it('CA-14: con la cuenta propietaria en solo lectura sigue descargando', async () => {
      const { token } = await newLink();
      sharing.storage.limits.setReadOnly(true);

      await downloadOk({ token });
    });

    describe('CA-11: el mismo 404 que `open`', () => {
      it.each([
        ['un token mal formado', { token: 'no-es-un-token' }],
        ['un cuerpo sin token', {}],
        ['una contraseña que no es texto', { token: LinkToken.generate().toString(), password: 7 }],
      ])('plan D-4: %s', async (_, body) => {
        expectUnavailable(await anonymous.download(body));
      });

      it('CA-17, plan D-4: un campo de más (`fileId`, `ownerId`) con un token válido', async () => {
        const { fileId, token } = await newLink();

        for (const extra of [{ fileId }, { ownerId: ana.id }]) {
          expectUnavailable(await anonymous.download({ token, ...extra }));
        }
        await downloadOk({ token });
      });

      it('archivo en la papelera; al restaurarlo vuelve a servir', async () => {
        const { fileId, token } = await newLink();
        await setTrashed(fileId, true);

        expectUnavailable(await anonymous.download({ token }));

        await setTrashed(fileId, false);
        await downloadOk({ token });
      });

      it('propietario suspendido', async () => {
        const { token } = await newLink();
        await setOwnerStatus('suspendida');

        expectUnavailable(await anonymous.download({ token }));
      });

      it('archivo purgado', async () => {
        const { fileId, token } = await newLink();
        await sharing.storage.owner.query('DELETE FROM archivo WHERE id = $1', [fileId]);

        expectUnavailable(await anonymous.download({ token }));
      });
    });

    it('CA-15, CA-18: `public_link.downloaded` con `trigger: public_link` en «Mi actividad» del propietario; no como descarga suya', async () => {
      const { fileId, token, link } = await newLink();

      const { response } = await downloadOk({ token });

      const correlationId = response.headers['x-correlation-id'] as string;
      const events = (await sharing.eventsOf(ana.id)).filter(
        (event) => event.recurso_id === fileId,
      );
      expect(events.map((event) => event.accion)).toEqual([
        'public_link.created',
        'public_link.downloaded',
      ]);
      expect(events[1]).toEqual({
        accion: 'public_link.downloaded',
        actor_id: ana.id,
        tipo_recurso: 'file',
        recurso_id: fileId,
        atributos: { trigger: 'public_link' },
        correlation_id: correlationId,
      });
      const activity = listAuditEventsResponseSchema.parse((await sharing.myEvents(ana)).body);
      expect(activity.items.find((item) => item.action === 'public_link.downloaded')).toMatchObject(
        {
          origin: 'self',
          resourceType: 'file',
          trigger: 'public_link',
        },
      );
      const lines = sharing.storage.testApp.logs.withCorrelationId(correlationId);
      expect(lines).toContainEqual(
        expect.objectContaining({ event: 'public_link.downloaded', linkId: link.id, fileId }),
      );
      const business = JSON.stringify(lines.filter((line) => line.event !== 'http.request'));
      for (const secret of [token, FILE_PREFIX, '127.0.0.1', '::1']) {
        expect(business).not.toContain(secret);
      }
    });
  });
});

/** CA-14, RN-7: el límite general de las rutas públicas, por red (IPv4 /32, IPv6 /64) con `X-Forwarded-For`. */
describe('POST /public-links/open y /download: límite por red (013 CA-13, CA-14, RN-7)', () => {
  const LIMIT = 2;
  let sharing: SharingHttpApp;

  beforeAll(async () => {
    sharing = await createSharingHttpApp({
      env: { PUBLIC_LINK_RATE_LIMIT_PER_MINUTE: String(LIMIT) },
    });
  });

  afterAll(async () => {
    await sharing?.close();
  });

  const openFrom = (ip: string): Promise<Response> =>
    sharing.visitor({ 'X-Forwarded-For': ip }).open({ token: LinkToken.generate().toString() });
  const downloadFrom = (ip: string): Promise<Response> =>
    sharing.visitor({ 'X-Forwarded-For': ip }).download({ token: LinkToken.generate().toString() });
  const randomNetwork = (): string =>
    `2001:db8:${Math.floor(Math.random() * 0xffff).toString(16)}:1`;

  it('CA-14: dos IPv6 del mismo /64 comparten el límite (429 con la espera); otra red no', async () => {
    const network = randomNetwork();
    for (let attempt = 0; attempt < LIMIT; attempt += 1) {
      expect((await openFrom(`${network}::${attempt + 1}`)).status).toBe(404);
    }

    const blocked = await openFrom(`${network}:ffff:ffff:ffff:ffff`);

    expect(blocked.status).toBe(429);
    expect((blocked.body as ErrorBody).code).toBe('SHARED_TOO_MANY_REQUESTS');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(JSON.stringify(blocked.body)).not.toMatch(/\d+ intentos?/);
    expect((await openFrom(`${network.replace(/:1$/, ':2')}::1`)).status).toBe(404);
  });

  it('CA-14: abrir y descargar comparten el mismo límite por red', async () => {
    const network = randomNetwork();
    expect((await openFrom(`${network}::1`)).status).toBe(404);
    expect((await downloadFrom(`${network}::2`)).status).toBe(404);

    expect((await downloadFrom(`${network}::3`)).status).toBe(429);
    expect((await openFrom(`${network}::4`)).status).toBe(429);
  });
});

/**
 * CA-12, CA-13, CA-18, RN-7: contraseña que falta o falla y bloqueo por enlace + red con `X-Forwarded-For`. El reloj
 * de la app es un `FixedClock` (también el del verificador de sesiones de prueba): la espera se cumple moviéndolo. Los
 * enlaces se insertan con su hash Argon2id, así su vencimiento sigue el reloj de la base y no el de la prueba.
 */
describe('POST /public-links/download: contraseña y bloqueo por enlace + red (013 CA-12, CA-13, CA-18, RN-7)', () => {
  const MAX_FAILURES = 3;
  const LOCK_SECONDS = 60;
  const WRONG_PASSWORD = 'otra-clave-1234';
  const clock = new FixedClock(PROBE_CLOCK_START);
  let sharing: SharingHttpApp;
  let ana: StorageClient;
  let passwordHash: string;

  beforeAll(async () => {
    sharing = await createSharingHttpApp({
      env: {
        PUBLIC_LINK_RATE_LIMIT_PER_MINUTE: ROOMY_RATE_LIMIT,
        PUBLIC_LINK_MAX_FAILURES: String(MAX_FAILURES),
        PUBLIC_LINK_FAILURE_WINDOW_MINUTES: '15',
        PUBLIC_LINK_LOCK_MINUTES: String(LOCK_SECONDS / 60),
      },
      overrides: [{ provide: I_CLOCK, useValue: clock }],
    });
    ana = await sharing.storage.newClient();
    const hasher = sharing.storage.testApp.app.get<IPasswordHasher>(I_PASSWORD_HASHER);
    passwordHash = (await hasher.hash(PASSWORD)).reveal();
  });

  afterAll(async () => {
    await sharing?.close();
  });

  /** Un enlace con contraseña sobre un archivo nuevo de Ana. */
  const protectedLink = async (): Promise<{ fileId: string; linkId: string; token: string }> => {
    const { fileId } = await insertCommittedFile(sharing.storage.owner, ana.id, {
      name: `${FILE_PREFIX}-${randomUUID()}.pdf`,
      sizeBytes: SIZE_BYTES,
    });
    const token = LinkToken.generate();
    const { id } = await insertPublicLink(sharing.storage.owner, {
      ownerId: ana.id,
      fileId,
      tokenHash: token.hash(),
      passwordHash,
    });
    return { fileId, linkId: id, token: token.toString() };
  };

  const downloadFrom = (ip: string, body: Record<string, unknown>): Promise<Response> =>
    sharing.visitor({ 'X-Forwarded-For': ip }).download(body);

  /** Un /64 al azar, para que cada caso cuente con su propia red. */
  const randomNetwork = (): string =>
    `2001:db8:${randomUUID().slice(0, 4)}:${randomUUID().slice(0, 4)}`;

  const expectPasswordInvalid = (response: Response): void => {
    expect(response.status).toBe(403);
    expect((response.body as ErrorBody).code).toBe('SHARING_LINK_PASSWORD_INVALID');
    expect(JSON.stringify(response.body)).not.toContain('X-Amz');
  };

  const businessLinesOf = (response: Response) =>
    sharing.storage.testApp.logs
      .withCorrelationId(response.headers['x-correlation-id'] as string)
      .filter((line) => line.event !== 'http.request');

  const lockedEventsOf = async (fileId: string) =>
    (await sharing.eventsOf(ana.id)).filter(
      (event) => event.recurso_id === fileId && event.accion === 'public_link.locked',
    );

  it('CA-12: sin contraseña (ausente o `""`) es 403 que no cuenta para el bloqueo ni se registra', async () => {
    const { token } = await protectedLink();
    const network = randomNetwork();

    for (let attempt = 0; attempt <= MAX_FAILURES; attempt += 1) {
      for (const body of [{ token }, { token, password: '' }]) {
        const response = await downloadFrom(`${network}::${attempt + 1}`, body);
        expectPasswordInvalid(response);
        expect(businessLinesOf(response).map((line) => line.event)).not.toContain(
          'public_link.password_failed',
        );
      }
    }

    expect((await downloadFrom(`${network}::9`, { token, password: PASSWORD })).status).toBe(200);
  });

  it('plan D-4: una contraseña de más de 128 caracteres es el 404 de CA-11, sin verificarla ni contar para el bloqueo', async () => {
    const { token } = await protectedLink();
    const network = randomNetwork();
    const tooLong = 'x'.repeat(PUBLIC_LINK_PASSWORD_MAX_LENGTH + 1);

    for (let attempt = 0; attempt <= MAX_FAILURES; attempt += 1) {
      const response = await downloadFrom(`${network}::${attempt + 1}`, {
        token,
        password: tooLong,
      });
      expect(response.status).toBe(404);
      expect((response.body as ErrorBody).code).toBe(UNAVAILABLE);
      expect(businessLinesOf(response).map((line) => line.event)).not.toContain(
        'public_link.password_failed',
      );
    }

    expect((await downloadFrom(`${network}::9`, { token, password: PASSWORD })).status).toBe(200);
  });

  it('CA-12: una incorrecta es 403 y queda en `password_failed` con solo el enlace, sin IP ni contraseña', async () => {
    const { token, linkId } = await protectedLink();
    const ip = `${randomNetwork()}::1`;

    const response = await downloadFrom(ip, { token, password: WRONG_PASSWORD });

    expectPasswordInvalid(response);
    const lines = businessLinesOf(response);
    expect(lines).toContainEqual(
      expect.objectContaining({ event: 'public_link.password_failed', linkId }),
    );
    const logged = JSON.stringify(lines);
    for (const secret of [token, WRONG_PASSWORD, ip, ip.split('::')[0] ?? ip]) {
      expect(logged).not.toContain(secret);
    }
  });

  it('CA-13, RN-7, CA-18: N fallos desde un /64 → 429 aunque sea la correcta; otra red descarga; tras la espera vuelve; `public_link.locked` una vez', async () => {
    const { fileId, token } = await protectedLink();
    const network = randomNetwork();
    for (let attempt = 0; attempt < MAX_FAILURES; attempt += 1) {
      const wrong = await downloadFrom(`${network}::${attempt + 1}`, {
        token,
        password: WRONG_PASSWORD,
      });
      expectPasswordInvalid(wrong);
    }

    const blocked = await downloadFrom(`${network}:ffff:ffff:ffff:ffff`, {
      token,
      password: PASSWORD,
    });
    expect(blocked.status).toBe(429);
    expect((blocked.body as ErrorBody).code).toBe('SHARED_TOO_MANY_REQUESTS');
    expect(blocked.headers['retry-after']).toBe(String(LOCK_SECONDS));
    expect(JSON.stringify(blocked.body)).not.toContain('X-Amz');
    const stillBlocked = await downloadFrom(`${network}::1`, { token, password: WRONG_PASSWORD });
    expect(stillBlocked.status).toBe(429);

    expect(
      (await downloadFrom(`${randomNetwork()}::1`, { token, password: PASSWORD })).status,
    ).toBe(200);

    const locked = await lockedEventsOf(fileId);
    expect(locked).toEqual([
      expect.objectContaining({
        actor_id: ana.id,
        tipo_recurso: 'file',
        atributos: { trigger: 'public_link' },
      }),
    ]);
    const activity = listAuditEventsResponseSchema.parse((await sharing.myEvents(ana)).body);
    expect(activity.items.filter((item) => item.action === 'public_link.locked')).toEqual([
      expect.objectContaining({ origin: 'self', resourceType: 'file', trigger: 'public_link' }),
    ]);

    clock.advance(LOCK_SECONDS * MS_PER_SECOND);
    expect((await downloadFrom(`${network}::2`, { token, password: PASSWORD })).status).toBe(200);
    expect(await lockedEventsOf(fileId)).toHaveLength(1);
  });

  it('CA-13: un acierto antes del máximo limpia los fallos de esa red', async () => {
    const { token } = await protectedLink();
    const ip = `${randomNetwork()}::1`;
    for (let attempt = 1; attempt < MAX_FAILURES; attempt += 1) {
      expectPasswordInvalid(await downloadFrom(ip, { token, password: WRONG_PASSWORD }));
    }
    expect((await downloadFrom(ip, { token, password: PASSWORD })).status).toBe(200);

    for (let attempt = 1; attempt < MAX_FAILURES; attempt += 1) {
      expectPasswordInvalid(await downloadFrom(ip, { token, password: WRONG_PASSWORD }));
    }
    expect((await downloadFrom(ip, { token, password: PASSWORD })).status).toBe(200);
  });
});
