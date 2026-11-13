import type { RoleName, SessionResponse } from '@nimbo/contracts';

/** Sesión de prueba que vence `ttlMs` después de `now`. */
export function sessionFixture(
  options: {
    readonly now?: number;
    readonly ttlMs?: number;
    readonly token?: string;
    readonly role?: RoleName;
  } = {},
): SessionResponse {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? 15 * 60 * 1000;
  return {
    accessToken: options.token ?? 'token-de-acceso',
    accessTokenExpiresAt: new Date(now + ttlMs).toISOString(),
    user: {
      id: '0b7e6c1a-6f0e-4c1b-9d3a-2f5b8e9a1c4d',
      fullName: 'Ana López',
      email: 'ana@ejemplo.com',
      role: options.role ?? 'CLIENT',
      pendingPlanSlug: null,
    },
  };
}
