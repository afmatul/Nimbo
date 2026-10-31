import { randomUUID } from 'node:crypto';

import request from 'supertest';
import type { Response } from 'supertest';
import { DataSource } from 'typeorm';

import { PasswordHash } from '../../../src/shared';
import {
  ARGON2ID_MEMORY_COST_KIB,
  ARGON2ID_PARALLELISM,
  ARGON2ID_TIME_COST,
  Argon2idHasher,
} from '../../../src/shared/infrastructure/security/argon2id.hasher';
import {
  createIdentityTestApp,
  validRegistration,
  verificationTokenSentTo,
} from '../identity/identity-test-app';
import { deleteAll } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';

const REGISTER = '/api/v1/auth/register';
const RESEND = '/api/v1/auth/resend-verification';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
/** `$argon2id$v=19$<parámetros>$<sal>$<hash>` (formato PHC). */
const ARGON2ID_PHC = /^\$argon2id\$v=19\$([^$]+)\$([^$]+)\$([^$]+)$/;
/** Mínimo de RN-3 (OWASP). */
const RN3_MINIMUM = { m: 19_456, t: 2, p: 1 } as const;

interface ParsedPhc {
  readonly params: Readonly<Record<string, number>>;
  readonly salt: string;
  readonly hash: string;
}

/**
 * Los parámetros se comparan como mapa y no como texto: la librería los escribe como `m=…,p=…,t=…` (nota de T-41),
 * un PHC válido con los mismos valores que `m=…,t=…,p=…`.
 */
const parsePhc = (phc: string): ParsedPhc => {
  const match = ARGON2ID_PHC.exec(phc);
  if (match === null) throw new Error('El hash guardado no es un PHC de Argon2id v19.');
  const [, params = '', salt = '', hash = ''] = match;
  const entries = params.split(',').map((pair) => {
    const [name = '', value = ''] = pair.split('=');
    return [name, Number(value)] as const;
  });
  return { params: Object.fromEntries(entries), salt, hash };
};

/** Lo que un cliente ve de una respuesta: cuerpo y cabeceras. */
const visiblePartOf = (response: Response): string =>
  JSON.stringify({ body: response.body as unknown, headers: response.headers });

/** CA-19: contraseñas con Argon2id (RN-3), sal aleatoria y sin el hash en ninguna respuesta. */
describe('hash de la contraseña (CA-19)', () => {
  let testApp: TestApp;
  let dataSource: DataSource;
  const hasher = new Argon2idHasher();
  const password = validRegistration('').password;

  const storedHashOf = async (email: string): Promise<string> => {
    const [row] = (await dataSource.query('SELECT hash_clave FROM usuario WHERE correo = $1', [
      email,
    ])) as { hash_clave: string }[];
    if (row === undefined) throw new Error('La cuenta no existe.');
    return row.hash_clave;
  };

  beforeAll(async () => {
    testApp = await createIdentityTestApp();
    dataSource = testApp.app.get(DataSource);
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await deleteAll();
  });

  it('CA-19: dos cuentas con la misma contraseña guardan PHC de Argon2id distintos, con parámetros ≥ RN-3, que la verifican', async () => {
    const emails = [`ana-${randomUUID()}@ejemplo.com`, `luis-${randomUUID()}@ejemplo.com`];
    const server = testApp.app.getHttpServer();
    for (const email of emails) {
      await request(server).post(REGISTER).send(validRegistration(email)).expect(202);
    }

    const stored = await Promise.all(emails.map(storedHashOf));
    const parsed = stored.map(parsePhc);

    for (const phc of parsed) {
      expect(phc.params['m']).toBeGreaterThanOrEqual(RN3_MINIMUM.m);
      expect(phc.params['t']).toBeGreaterThanOrEqual(RN3_MINIMUM.t);
      expect(phc.params['p']).toBeGreaterThanOrEqual(RN3_MINIMUM.p);
      expect(phc.params).toEqual({
        m: ARGON2ID_MEMORY_COST_KIB,
        t: ARGON2ID_TIME_COST,
        p: ARGON2ID_PARALLELISM,
      });
    }
    expect(stored[0]).not.toBe(stored[1]);
    expect(parsed[0]?.salt).not.toBe(parsed[1]?.salt);
    for (const phc of stored) {
      await expect(hasher.verify(PasswordHash.fromPhc(phc), password)).resolves.toBe(true);
      await expect(hasher.verify(PasswordHash.fromPhc(phc), `${password}x`)).resolves.toBe(false);
    }
  });

  it('CA-19: ninguna respuesta de registro, reenvío o verificación incluye la contraseña ni su hash', async () => {
    const email = `ana-${randomUUID()}@ejemplo.com`;
    const server = testApp.app.getHttpServer();

    const responses = [
      await request(server).post(REGISTER).send(validRegistration(email)),
      await request(server).post(REGISTER).send(validRegistration(email)),
      await request(server).post(RESEND).send({ email }),
    ];
    const token = await verificationTokenSentTo(email);
    responses.push(await request(server).post(VERIFY_EMAIL).send({ token }));
    const stored = await storedHashOf(email);

    expect(responses.map((response) => response.status)).toEqual([202, 429, 429, 200]);
    for (const response of responses) {
      const visible = visiblePartOf(response);
      expect(visible).not.toContain(password);
      expect(visible).not.toContain(stored);
      expect(visible).not.toContain('$argon2');
    }
  });
});
