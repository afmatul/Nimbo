import type { SessionUser } from '@nimbo/contracts';

import { subscribeHref } from '../billing';

/**
 * Usuario de la sesión con el plan de pago que eligió al registrarse y aún no paga.
 * TODO(contracts): quitar cuando `SessionUser` de `@nimbo/contracts` publique `pendingPlanSlug` (acordado, 2026-11-13).
 */
export type PendingPlanUser = SessionUser & { readonly pendingPlanSlug?: string | null };

/** Contratar el plan pendiente (`/planes/contratar?slug=…`), o `null` si no hay ninguno. */
export function pendingPlanPathOf(user: PendingPlanUser): string | null {
  const slug = user.pendingPlanSlug ?? null;
  return slug === null ? null : subscribeHref(slug);
}
