import { randomUUID } from 'node:crypto';

import {
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  EMAIL_REQUESTS_PER_HOUR,
  LEGAL_DOCUMENTS,
} from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';
import type { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK, Role } from '../../src/shared';
import { createIdentityTestApp } from '../int/identity/identity-test-app';
import type { TestApp } from '../int/setup/test-app';
import { connectAsOwner } from '../support/database-urls';

import { createIsolationWorld } from './setup/isolation-world';
import type { IsolationWorld } from './setup/isolation-world';

const FORGOT_PASSWORD = '/api/v1/auth/forgot-password';
const RESEND = '/api/v1/auth/resend-verification';
const MS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 3600;
const COOLDOWN_MS = EMAIL_REQUEST_COOLDOWN_SECONDS * MS_PER_SECOND;
/** PHC de relleno para la cuenta no verificada: nadie inicia sesión con ella. */
const PLACEHOLDER_PHC = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdGVuaXNv$aXNvbGF0aW9u';
/** Mismo nombre que los clientes del mundo: el nombre tampoco distingue a la no verificada. */
const WORLD_NAME = 'Ana López';

/**
 * Las cuatro clases de CA-18. La interna se prueba con los tres roles del mundo de 003, porque cada rol es una
 * cuenta distinta y ninguno debe responder distinto de un correo sin cuenta.
 */
const ACCOUNT_KINDS = [
  'inexistente',
  'no-verificada',
  'verificada',
  'interna-admin',
  'interna-soporte',
  'interna-operador',
] as const;
type AccountKind = (typeof ACCOUNT_KINDS)[number];

interface Target {
  readonly email: string;
  readonly id: string | null;
}

/** Lo que ve quien llama: status, cuerpo y cabeceras. */
interface Observed {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, unknown>>;
}

/**
 * Excepciones a «cabeceras idénticas», cada una justificada:
 * - `date`: es la hora de pared a la que se escribió la respuesta (segundos); depende de cuándo corre la prueba, no
 *   de la cuenta.
 *
 * No se excluye nada más. `x-correlation-id` **no** es excepción: cada petición equivalente manda el mismo
 * `X-Correlation-Id`, así el eco de la cabecera, el `correlationId` del cuerpo de los 429 y las cabeceras derivadas
 * del cuerpo (`content-length`, `etag`) deben coincidir byte a byte. `retry-after` tampoco: el reloj es fijo y cada
 * clase recorre la secuencia con los mismos tiempos relativos.
 */
const observe = (response: Response): Observed => {
  const { date: _date, ...headers } = response.headers as Record<string, unknown>;
  return { status: response.status, body: response.body as unknown, headers };
};

/**
 * Pide, repite dentro de los 60 s y luego pide una vez por minuto hasta pasar las 5 de la hora: recorre el `202`,
 * el `429` del enfriamiento y el `429` del límite por hora agotado.
 */
const SEQUENCE_ADVANCE_MS: readonly number[] = [
  0,
  0,
  ...Array.from({ length: EMAIL_REQUESTS_PER_HOUR - 1 }, () => COOLDOWN_MS),
  COOLDOWN_MS,
];
const HOURLY_RETRY_AFTER =
  SECONDS_PER_HOUR - EMAIL_REQUESTS_PER_HOUR * EMAIL_REQUEST_COOLDOWN_SECONDS;
const EXPECTED_SEQUENCE = [
  '202 -',
  `429 ${String(EMAIL_REQUEST_COOLDOWN_SECONDS)}`,
  ...Array.from({ length: EMAIL_REQUESTS_PER_HOUR - 1 }, () => '202 -'),
  `429 ${String(HOURLY_RETRY_AFTER)}`,
];

const statusAndRetryAfter = (observed: Observed): string =>
  `${String(observed.status)} ${String(observed.headers['retry-after'] ?? '-')}`;

/**
 * Anti-enumeración de la recuperación (002 CA-18, RN-2, Art. IX) sobre el mundo de aislamiento de 003: un cliente
 * verificado y las tres cuentas internas del mundo, más un cliente sin verificar (insertado como el dueño, igual que
 * el mundo) y un correo sin cuenta. Nadie que llame a `POST /auth/forgot-password` puede distinguir, por status,
 * cuerpo o cabeceras, a cuál de ellas corresponde el correo, ni antes ni después de agotar el límite por correo.
 */
describe('anti-enumeración de la recuperación de contraseña (CA-18)', () => {
  const clock = new FixedClock(new Date());
  let world: IsolationWorld;
  let owner: DataSource;
  let testApp: TestApp;
  const unverifiedIds: string[] = [];
  let nextIp = 0;

  const newIp = (): string => `198.51.100.${String((nextIp += 1))}`;

  const post = (path: string, email: string, correlationId: string, ip: string) =>
    request(testApp.app.getHttpServer())
      .post(path)
      .set('X-Forwarded-For', ip)
      .set('X-Correlation-Id', correlationId)
      .send({ email });

  /** Cliente sin verificar, idéntico a los del mundo salvo `correo_verificado` (D-15). */
  const insertUnverified = async (): Promise<Target> => {
    const id = randomUUID();
    const email = `ana.lopez.${randomUUID()}@ejemplo.com`;
    await owner.query(
      `INSERT INTO usuario (id, nombre, correo, hash_clave, rol, correo_verificado, version_terminos,
                            version_privacidad, terminos_aceptados_en)
       VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8)`,
      [
        id,
        WORLD_NAME,
        email,
        PLACEHOLDER_PHC,
        Role.CLIENT,
        LEGAL_DOCUMENTS.terms.version,
        LEGAL_DOCUMENTS.privacy.version,
        clock.now(),
      ],
    );
    unverifiedIds.push(id);
    return { email, id };
  };

  /** Cada prueba usa correos sin historial de límites: nada arrastra el estado de otra prueba. */
  const targets = async (): Promise<Record<AccountKind, Target>> => {
    const [client] = world.clients;
    const asTarget = ({ email, id }: { email: string; id: string }): Target => ({ email, id });
    return {
      inexistente: { email: `ana.lopez.${randomUUID()}@ejemplo.com`, id: null },
      'no-verificada': await insertUnverified(),
      verificada: asTarget(client),
      'interna-admin': asTarget(world.internals[Role.ADMIN]),
      'interna-soporte': asTarget(world.internals[Role.SUPPORT]),
      'interna-operador': asTarget(world.internals[Role.OPERATOR]),
    };
  };

  /** Ninguna respuesta lleva datos de la cuenta, cookies ni cabeceras de límite. */
  const expectNothingRevealed = (observed: readonly Observed[], target: Target): void => {
    for (const response of observed) {
      const visible = JSON.stringify(response);
      expect(visible).not.toContain(target.email);
      expect(visible).not.toContain(WORLD_NAME);
      if (target.id !== null) expect(visible).not.toContain(target.id);
      const names = Object.keys(response.headers);
      expect(names).not.toContain('set-cookie');
      expect(
        names.filter((name) => name.startsWith('x-ratelimit') || name.startsWith('retry-after-')),
      ).toEqual([]);
    }
  };

  beforeAll(async () => {
    owner = await connectAsOwner();
    world = await createIsolationWorld();
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
  });

  /**
   * El mundo es uno por suite y sus cuentas se reutilizan: dos horas de reloj entre pruebas vacían las ventanas de
   * 60 s y de 1 h, así cada prueba empieza con todas las clases sin pedidos previos.
   */
  beforeEach(() => {
    clock.advance(2 * SECONDS_PER_HOUR * MS_PER_SECOND);
  });

  afterAll(async () => {
    await testApp?.close();
    await owner?.query('DELETE FROM usuario WHERE id = ANY($1)', [unverifiedIds]);
    await owner?.destroy();
    await world?.close();
  });

  it('CA-18: las cuatro clases de cuenta (con los tres roles internos) dan el mismo status, cuerpo y cabeceras en `forgot-password`, también con el límite por correo agotado', async () => {
    const byKind = await targets();
    const results = {} as Record<AccountKind, Observed[]>;

    for (const kind of ACCOUNT_KINDS) {
      const ip = newIp();
      const observed: Observed[] = [];
      for (const [step, advanceMs] of SEQUENCE_ADVANCE_MS.entries()) {
        clock.advance(advanceMs);
        const response = await post(
          FORGOT_PASSWORD,
          byKind[kind].email,
          `iso-rec-${String(step)}`,
          ip,
        );
        observed.push(observe(response));
      }
      results[kind] = observed;
    }

    const reference = results.inexistente;
    expect(reference.map(statusAndRetryAfter)).toEqual(EXPECTED_SEQUENCE);
    expect(reference[0]?.body).toEqual({ status: 'accepted' });
    expect(reference.at(-1)?.body).toMatchObject({ code: 'IDENTITY_TOO_MANY_REQUESTS' });
    for (const kind of ACCOUNT_KINDS) {
      expect({ kind, observed: results[kind] }).toEqual({ kind, observed: reference });
      expectNothingRevealed(results[kind], byKind[kind]);
    }
  });

  it('CA-18: con el límite por hora agotado, un pedido más sigue siendo idéntico en las cuatro clases', async () => {
    const byKind = await targets();
    const exhausted = {} as Record<AccountKind, Observed>;

    for (const kind of ACCOUNT_KINDS) {
      const ip = newIp();
      for (const advanceMs of SEQUENCE_ADVANCE_MS) {
        clock.advance(advanceMs);
        await post(FORGOT_PASSWORD, byKind[kind].email, `iso-previo-${randomUUID()}`, ip);
      }
      // Ya fuera del enfriamiento de 60 s, pero dentro de la hora: solo responde el límite por hora.
      clock.advance(COOLDOWN_MS);
      exhausted[kind] = observe(await post(FORGOT_PASSWORD, byKind[kind].email, 'iso-agotado', ip));
    }

    expect(exhausted.inexistente).toMatchObject({
      status: 429,
      body: { code: 'IDENTITY_TOO_MANY_REQUESTS' },
    });
    for (const kind of ACCOUNT_KINDS) {
      expect({ kind, observed: exhausted[kind] }).toEqual({
        kind,
        observed: exhausted.inexistente,
      });
      expectNothingRevealed([exhausted[kind]], byKind[kind]);
    }
  });

  /**
   * Oráculo entre rutas (hallazgo de seguridad de T-67): para la cuenta no verificada, `forgot-password` consume en
   * silencio el límite de verificación de 001 (DT-7), compartido con registro y reenvío (001 D-8). Un `202` de
   * `resend-verification` justo después solo cambia a `429` si el correo es de un cliente sin verificar, así que la
   * secuencia «recuperar → reenviar» delata esa clase aunque la respuesta de `forgot-password` sea neutra.
   * `it.failing`: hoy la prueba falla (el oráculo existe) y la suite sigue verde; cuando se corrija, Jest marcará
   * esta prueba en rojo y habrá que cambiarla por `it`.
   */
  it.failing(
    'CA-18: `resend-verification` justo después de `forgot-password` responde igual en las cuatro clases (oráculo entre rutas)',
    async () => {
      const byKind = await targets();
      const followUps = {} as Record<AccountKind, Observed>;

      for (const kind of ACCOUNT_KINDS) {
        const ip = newIp();
        clock.advance(COOLDOWN_MS);
        await post(FORGOT_PASSWORD, byKind[kind].email, 'iso-oraculo-1', ip);
        followUps[kind] = observe(await post(RESEND, byKind[kind].email, 'iso-oraculo-2', ip));
      }

      for (const kind of ACCOUNT_KINDS) {
        expect({ kind, observed: followUps[kind] }).toEqual({
          kind,
          observed: followUps.inexistente,
        });
      }
    },
  );
});
