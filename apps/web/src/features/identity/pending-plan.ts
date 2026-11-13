import type { SessionUser } from '@nimbo/contracts';

import { subscribeHref } from '../billing';

/** Contratar el plan pendiente (`/planes/contratar?slug=…`), o `null` si no hay ninguno. */
export function pendingPlanPathOf(user: SessionUser): string | null {
  return user.pendingPlanSlug === null ? null : subscribeHref(user.pendingPlanSlug);
}
