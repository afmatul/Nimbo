import { randomUUID } from 'node:crypto';

import { createdPublicLinkSchema, publicLinkDetailsSchema } from '@nimbo/contracts';
import type { Response } from 'supertest';

import { LinkToken } from '../../../src/modules/sharing/domain/link-token';
import { Role } from '../../../src/shared';
import { insertCommittedFile } from '../storage/storage-http';
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
 * `POST /public-links/open` por HTTP con Postgres, Redis y la función `enlace_por_token()` reales (spec 013 CA-9,
 * CA-11, CA-14, CA-16; plan §6, ADR-0039). Ana comparte; el visitante no tiene sesión.
 */
describe('POST /public-links/open (013 CA-9, CA-11, CA-14, CA-16)', () => {
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
});

/** CA-14, RN-7: el límite general de las rutas públicas, por red (IPv4 /32, IPv6 /64) con `X-Forwarded-For`. */
describe('POST /public-links/open: límite por red (013 CA-13, CA-14, RN-7)', () => {
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

  it('CA-14: dos IPv6 del mismo /64 comparten el límite (429 con la espera); otra red no', async () => {
    const network = `2001:db8:${Math.floor(Math.random() * 0xffff).toString(16)}:1`;
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
});
