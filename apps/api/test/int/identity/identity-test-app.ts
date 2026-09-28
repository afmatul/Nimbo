import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import type { RegisterRequest } from '@nimbo/contracts';

import { IDENTITY_THROTTLERS, IdentityModule } from '../../../src/modules/identity';
import { NotificationsWorkerModule } from '../../../src/modules/notifications';
import { getMessage, waitForMessages } from '../setup/mailpit';
import { buildTestEnv, createTestApp } from '../setup/test-app';
import type { TestApp, TestAppOptions } from '../setup/test-app';

/** Token del enlace del correo: 43 caracteres base64url en el fragmento (plan §6.2, RN-8). */
const LINK_TOKEN = /\/verificar-correo#token=([A-Za-z0-9_-]{43})/;

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
 * lleguen a Mailpit.
 */
export const createIdentityTestApp = (
  options: Pick<TestAppOptions, 'overrides'> = {},
): Promise<TestApp> =>
  createTestApp({
    withWorkerEnv: true,
    modules: [
      EventEmitterModule.forRoot(),
      ThrottlerModule.forRoot({ throttlers: [...IDENTITY_THROTTLERS] }),
      NotificationsWorkerModule,
      IdentityModule.forRoot(buildTestEnv()),
    ],
    ...options,
  });

/** Espera el correo de verificación dirigido a `email` y devuelve el token de su enlace. */
export const verificationTokenSentTo = async (email: string): Promise<string> => {
  const messages = await waitForMessages(1);
  const summary = messages.find((message) =>
    message.To.some((recipient) => recipient.Address === email),
  );
  if (summary === undefined) throw new Error('No llegó el correo de verificación.');
  const token = LINK_TOKEN.exec((await getMessage(summary.ID)).Text)?.[1];
  if (token === undefined) throw new Error('El correo no trae el enlace de verificación.');
  return token;
};
