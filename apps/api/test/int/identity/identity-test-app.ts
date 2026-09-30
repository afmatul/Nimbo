import { setTimeout as delay } from 'node:timers/promises';

import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import type { RegisterRequest } from '@nimbo/contracts';
import type { Queue } from 'bullmq';

import { IDENTITY_THROTTLERS, IdentityModule } from '../../../src/modules/identity';
import { MAIL_QUEUE, NotificationsWorkerModule } from '../../../src/modules/notifications';
import type { Env } from '../../../src/shared';
import { getMessage, listMessages } from '../setup/mailpit';
import type { MailpitSummary } from '../setup/mailpit';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp, TestAppOptions } from '../setup/test-app';

/** Token del enlace del correo: 43 caracteres base64url en el fragmento (plan §6.2, RN-8). */
const LINK_TOKEN = /\/verificar-correo#token=([A-Za-z0-9_-]{43})/;

/** Estados de un trabajo de `mail` que aún no se entregó (o que el `worker` tiene entre manos). */
const PENDING_MAIL_STATES = ['waiting', 'active', 'delayed', 'prioritized'] as const;
const MAIL_DRAIN_TIMEOUT_MS = 15_000;
const MAIL_DRAIN_STEP_MS = 100;
const MAIL_ARRIVAL_TIMEOUT_MS = 10_000;

/** Espera a que el `worker` de la app entregue todo lo encolado; lanza si no ocurre a tiempo. */
const waitForMailQueueIdle = async (queue: Queue): Promise<void> => {
  const deadline = Date.now() + MAIL_DRAIN_TIMEOUT_MS;
  for (;;) {
    const counts = await queue.getJobCounts(...PENDING_MAIL_STATES);
    const pending = Object.values(counts).reduce((total, count) => total + count, 0);
    if (pending === 0) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `La cola mail sigue con ${String(pending)} trabajos al cerrar la app de la prueba`,
      );
    }
    await delay(MAIL_DRAIN_STEP_MS);
  }
};

/** Cuerpo válido de `POST /auth/register` (CA-1); el correo cambia por prueba. */
export const validRegistration = (email: string): RegisterRequest => ({
  fullName: 'Lucía Pérez',
  email,
  password: 'Nimbo-Seguro-2026',
  acceptTerms: true,
});

/**
 * App de integración con la composición de `identity` de `AppModule` (plan §6.8): eventos en proceso, *throttlers*
 * de `identity`, `IdentityModule` y, en la misma app, el lado `worker` de `notifications` para que los correos
 * lleguen a Mailpit. La estrategia `ACCESS_TOKEN_STRATEGY` es la real de `identity` (002 T-39); `identityEnv`
 * cambia solo lo que lee `IdentityModule.forRoot` (p. ej. `APP_ENV` para `cookieSecure`) y `modules` se suman a
 * la composición. `close` espera a que la cola `mail` quede vacía: un correo encolado y no entregado (p. ej. los
 * avisos de los registros concurrentes de CA-3) lo entregaría el `worker` de la suite siguiente en el Mailpit
 * compartido, en medio de sus pruebas.
 */
export const createIdentityTestApp = async (
  options: Pick<TestAppOptions, 'overrides' | 'modules'> & {
    readonly identityEnv?: Partial<Env>;
  } = {},
): Promise<TestApp> => {
  const { identityEnv = {}, modules = [], overrides } = options;
  const testApp = await createTestApp({
    withWorkerEnv: true,
    accessTokenStrategy: 'identity',
    modules: [
      EventEmitterModule.forRoot(),
      ThrottlerModule.forRoot({ throttlers: [...IDENTITY_THROTTLERS] }),
      NotificationsWorkerModule,
      IdentityModule.forRoot({ ...buildTestEnv(), ...identityEnv }),
      ...modules,
    ],
    ...(overrides === undefined ? {} : { overrides }),
  });
  const mailQueue = testApp.app.get<Queue>(getQueueToken(MAIL_QUEUE));
  return {
    ...testApp,
    close: async () => {
      await waitForMailQueueIdle(mailQueue);
      await testApp.close();
    },
  };
};

/**
 * Espera un correo dirigido a `email` (y con ese asunto, si se da). No basta con «hay al menos un mensaje»: un correo
 * de la prueba anterior que el `worker` entrega después del `deleteAll` del `beforeEach` llenaría la bandeja antes que
 * el de esta prueba.
 */
export const firstMessageTo = async (email: string, subject?: string): Promise<MailpitSummary> => {
  const deadline = Date.now() + MAIL_ARRIVAL_TIMEOUT_MS;
  for (;;) {
    const summary = (await listMessages()).find(
      (message) =>
        message.To.some((recipient) => recipient.Address === email) &&
        (subject === undefined || message.Subject === subject),
    );
    if (summary !== undefined) return summary;
    if (Date.now() >= deadline) throw new Error('No llegó el correo esperado.');
    await delay(MAIL_DRAIN_STEP_MS);
  }
};

/** Espera el correo de verificación dirigido a `email` y devuelve el token de su enlace. */
export const verificationTokenSentTo = async (email: string): Promise<string> => {
  const summary = await firstMessageTo(email);
  const token = LINK_TOKEN.exec((await getMessage(summary.ID)).Text)?.[1];
  if (token === undefined) throw new Error('El correo no trae el enlace de verificación.');
  return token;
};
