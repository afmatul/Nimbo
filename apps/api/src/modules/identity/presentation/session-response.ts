import type { SessionResponse } from '@nimbo/contracts';

import type { IssuedSession } from '../application/session.service';

/** `SessionResponse` del contrato (plan §5): el token de refresco nunca va en el cuerpo, solo en su cookie. */
export const toSessionResponse = (session: IssuedSession): SessionResponse => ({
  accessToken: session.access.token,
  accessTokenExpiresAt: session.access.expiresAt.toISOString(),
  user: { ...session.user },
});
