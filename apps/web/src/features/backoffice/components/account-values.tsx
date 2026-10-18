import {
  formatBytes,
  type AccountListItem,
  type AccountStatusName,
  type RoleName,
} from '@nimbo/contracts';
import { Ban, CircleCheck, MailCheck, MailX, ShieldCheck, Users } from 'lucide-react';
import type { JSX } from 'react';

import { StatusBadge } from '../../../components/nimbo/status-badge';
import { Badge } from '../../../components/ui/badge';
import { ROLE_LABELS } from '../../access/role-labels';

/** Aviso fijo de privacidad del área del Administrador (mockup `backoffice/admin`, decisión 2; P-5). */
export const ADMIN_PRIVACY =
  'La administración muestra metadatos de los archivos (nombre, tipo, tamaño, fechas y estado), nunca su contenido.';

/** Nombre de pila para los avisos de auditoría («…la auditoría que ve Laura»). */
export function firstNameOf(fullName: string): string {
  return fullName.split(/\s+/)[0] ?? fullName;
}

/** Una interna no tiene suscripción ni cuota (CA-1): plan y espacio no aplican. */
export const isInternal = (account: AccountListItem): boolean => account.role !== 'CLIENT';

const INTERNAL_REASON = 'No aplica: cuenta interna';
const NO_SUBSCRIPTION = 'Sin suscripción';

/** «Activa» o «Suspendida», con ícono y texto (decisión 4). */
export function AccountStatusBadge({
  status,
}: {
  readonly status: AccountStatusName;
}): JSX.Element {
  return status === 'active' ? (
    <StatusBadge tone="success" icon={CircleCheck} label="Activa" />
  ) : (
    <StatusBadge tone="destructive" icon={Ban} label="Suspendida" />
  );
}

/** «Sí» o «No» con su ícono: la verificación nunca solo por color. */
export function VerifiedValue({ verified }: { readonly verified: boolean }): JSX.Element {
  const Icon = verified ? MailCheck : MailX;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-4 w-4 shrink-0 text-secondary-foreground" aria-hidden="true" />
      {verified ? 'Sí' : 'No'}
    </span>
  );
}

/** «—» a la vista y el motivo para lectores de pantalla (decisión 5). */
function NotApplicable({ reason }: { readonly reason: string }): JSX.Element {
  return (
    <>
      <span className="text-muted-foreground" aria-hidden="true">
        —
      </span>
      <span className="sr-only">{reason}</span>
    </>
  );
}

/** Plan del cliente; «—» en una interna y en un cliente sin suscripción (CA-1, 009). */
export function PlanValue({ account }: { readonly account: AccountListItem }): JSX.Element {
  if (account.planName !== null) return <>{account.planName}</>;
  return <NotApplicable reason={isInternal(account) ? INTERNAL_REASON : NO_SUBSCRIPTION} />;
}

/** Espacio usado (bytes como texto decimal, ADR-0016); «—» en una interna. */
export function UsedSpaceValue({ account }: { readonly account: AccountListItem }): JSX.Element {
  if (account.usedBytes === null) return <NotApplicable reason={INTERNAL_REASON} />;
  return <span className="tabular-nums">{formatBytes(Number(account.usedBytes))}</span>;
}

/** Plan a la vista en la fila apilada (360 px): el nombre, o «Sin suscripción». */
export function planLabel(account: AccountListItem): string {
  return account.planName ?? NO_SUBSCRIPTION;
}

/** «TÚ» junto al nombre de la propia cuenta (decisión 5, CA-4). */
export function SelfTag(): JSX.Element {
  return (
    <span className="ml-1.5 rounded-sm border border-border bg-muted px-1.5 py-px text-xs font-semibold tracking-wide text-secondary-foreground">
      TÚ
    </span>
  );
}

/** El rol en una etiqueta neutra (no es un estado): «Cliente» o el rol interno, con su ícono. */
export function RoleBadge({ role }: { readonly role: RoleName }): JSX.Element {
  const Icon = role === 'CLIENT' ? Users : ShieldCheck;
  return (
    <Badge variant="outline" className="gap-1 bg-muted text-secondary-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {ROLE_LABELS[role]}
    </Badge>
  );
}
