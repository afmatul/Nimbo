import { ParseUUIDPipe } from '@nestjs/common';

import { ShareNotFoundError } from '../domain/errors';

/** Las respuestas de `sharing` llevan correos y nombres (plan §4): ningún intermediario las guarda. */
export const NO_STORE = 'no-store';

/** CA-11: un `:shareId` que no es UUID es el mismo 404 que uno ajeno, inexistente o ya revocado. */
export const shareIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new ShareNotFoundError() });
