'use client';

import type { AccountLimits, AccountLimitsStatus, AccountListItem } from '@nimbo/contracts';
import {
  CalendarDays,
  CheckCircle2,
  CircleCheck,
  CircleX,
  Clock,
  HardDrive,
  History,
  Info,
  Lock,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';

import { ConfirmDestructiveDialog } from '../../../components/nimbo/confirm-destructive-dialog';
import { StateView } from '../../../components/nimbo/state-view';
import { StatusBadge, type StatusTone } from '../../../components/nimbo/status-badge';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { toApiClientError, type ApiClientError } from '../../../lib/api-error';
import { lastDayLabel } from '../../../lib/format-date';
import { formatPlanBytes } from '../../../lib/format-plan';
import { ForbiddenState } from '../../access/components/forbidden-state';
import { ServerErrorAlert } from '../../identity/components/server-error-alert';
import type { BackofficeApi } from '../api';
import { useAccountLimits, type AccountLimitsLoad } from '../hooks/use-account-limits';
import { useReturnFocus } from '../hooks/use-return-focus';
import { usedPercent } from '../limits-form-values';

import { Fact, Note } from './account-facts';
import { firstNameOf } from './account-values';
import { InfoNote } from './info-note';
import { ProfileCard } from './profile-card';
import { QuotaAdjustDialog } from './quota-adjust-dialog';
import { ValidityAdjustDialog } from './validity-adjust-dialog';

export type AccountLimitsApi = Pick<
  BackofficeApi,
  'getAccountLimits' | 'adjustQuota' | 'removeQuota' | 'adjustValidity'
>;

/** Mensaje clave de spec §6 (CA-7, RN-6). */
export const PERSONAL_NO_EXPIRY = 'Personal no vence: no tiene vigencia que extender.';

type LimitsDialog = 'quota' | 'validity' | 'removeExtra';
type LimitsNoticeKind = 'quotaSaved' | 'quotaRemoved' | 'validitySaved' | 'validityReactivated';

interface LimitsProps {
  readonly account: AccountListItem;
  readonly api: AccountLimitsApi;
}

const BADGES: Readonly<
  Record<
    Exclude<AccountLimitsStatus, 'none'>,
    { tone: StatusTone; icon: LucideIcon; label: string }
  >
> = {
  active: { tone: 'success', icon: CircleCheck, label: 'Vigente' },
  readOnly: { tone: 'destructive', icon: Lock, label: 'Solo lectura' },
  personal: { tone: 'neutral', icon: Clock, label: 'Sin vencimiento' },
};

const EXPIRY_NOTES: Readonly<Record<Exclude<AccountLimitsStatus, 'none'>, string>> = {
  active:
    'Al vencer el extra, la cuota vuelve a la del plan; la cuenta sigue vigente hasta su vencimiento.',
  readOnly: 'La cuenta está en solo lectura. Extiende la vigencia para que vuelva a vigente.',
  personal: PERSONAL_NO_EXPIRY,
};

const bytesText = (bytes: string | null): string => formatPlanBytes(bytes ?? '0');

const hasExtra = (limits: AccountLimits): boolean =>
  limits.extraQuotaUntil !== null && BigInt(limits.extraQuotaBytes) > 0n;

/** «Quitar extra» solo si hay extra y la cuota del plan ya cubre lo usado (RN-1, decisión 13). */
const canRemoveExtra = (limits: AccountLimits): boolean =>
  hasExtra(limits) && BigInt(limits.baseQuotaBytes ?? '0') >= BigInt(limits.usedBytes);

const untilText = (limits: AccountLimits): string =>
  limits.extraQuotaUntil === null ? '' : lastDayLabel(limits.extraQuotaUntil);

/** Avisos de éxito (mockups `cuota-guardada`, `extra-quitado`, `vigencia-guardada`), con los límites nuevos. */
const NOTICES: Readonly<
  Record<LimitsNoticeKind, (limits: AccountLimits, name: string) => readonly [string, string]>
> = {
  quotaSaved: (l, name) => [
    'Guardamos la cuota extra.',
    `${name} tiene ${bytesText(l.extraQuotaBytes)} extra hasta el ${untilText(l)}; la cuota total es ${bytesText(l.totalQuotaBytes)}.`,
  ],
  quotaRemoved: (l, name) => [
    'Quitamos el espacio extra.',
    `La cuota volvió a ${bytesText(l.baseQuotaBytes)}. ${name} sigue dentro de su plan; no se borró nada.`,
  ],
  validitySaved: (l) => [
    'Extendimos la vigencia.',
    `La cuenta vence el ${expiryText(l)} y sigue vigente. No se cobró ni facturó nada.`,
  ],
  validityReactivated: (l) => [
    'Extendimos la vigencia.',
    `La cuenta vence el ${expiryText(l)} y volvió a vigente. No se cobró ni facturó nada.`,
  ],
};

function expiryText(limits: AccountLimits): string {
  return limits.expiresAt === null ? 'No vence' : lastDayLabel(limits.expiresAt);
}

/** Consecuencias de quitar el extra (mockup `quitar-extra`): vuelve a la cuota del plan sin borrar nada. */
function removeDescription(limits: AccountLimits): string {
  return [
    `La cuota total vuelve a ${bytesText(limits.baseQuotaBytes)}, la de su plan ${limits.planName ?? ''}.`,
    `La cuenta usa ${bytesText(limits.usedBytes)}, así que sigue dentro de la cuota.`,
    'No se borra ningún archivo, no se cambia el plan y no se cobra nada.',
    'Queda en su auditoría con la fecha y tu rol (Administrador).',
  ].join(' ');
}

interface LimitsFlow {
  readonly dialog: LimitsDialog | null;
  readonly notice: LimitsNoticeKind | null;
  /** Rechazo de «Quitar extra»: nada cambió. */
  readonly failure: ApiClientError | null;
  readonly removing: boolean;
  readonly open: (dialog: LimitsDialog) => void;
  readonly close: () => void;
  readonly saved: (notice: LimitsNoticeKind) => (limits: AccountLimits) => void;
  readonly removeExtra: () => void;
}

/** Qué diálogo está abierto, el último aviso y la petición de quitar el extra. */
function useLimitsFlow({
  account,
  api,
  onChanged,
}: LimitsProps & { readonly onChanged: (limits: AccountLimits) => void }): LimitsFlow {
  const [dialog, setDialog] = React.useState<LimitsDialog | null>(null);
  const [notice, setNotice] = React.useState<LimitsNoticeKind | null>(null);
  const [failure, setFailure] = React.useState<ApiClientError | null>(null);
  const [removing, setRemoving] = React.useState(false);
  const saved = (kind: LimitsNoticeKind) => (limits: AccountLimits) => {
    onChanged(limits);
    setNotice(kind);
    setDialog(null);
  };
  const removeExtra = (): void => {
    setRemoving(true);
    void api
      .removeQuota(account.id)
      .then(saved('quotaRemoved'), (caught: unknown) => {
        setFailure(toApiClientError(caught));
        setDialog(null);
      })
      .finally(() => setRemoving(false));
  };
  const open = (next: LimitsDialog): void => {
    setDialog(next);
    setNotice(null);
    setFailure(null);
  };
  return {
    dialog,
    notice,
    failure,
    removing,
    open,
    close: () => setDialog(null),
    saved,
    removeExtra,
  };
}

/** Éxito (`role="status"`) o el rechazo de quitar el extra (decisión 16). */
function LimitsNotice({
  flow,
  limits,
  account,
}: {
  readonly flow: LimitsFlow;
  readonly limits: AccountLimits;
  readonly account: AccountListItem;
}): React.ReactNode {
  if (flow.failure !== null) {
    return (
      <div className="mt-4">
        <ServerErrorAlert title="No quitamos el espacio extra." error={flow.failure} />
      </div>
    );
  }
  if (flow.notice === null) return null;
  const [title, text] = NOTICES[flow.notice](limits, firstNameOf(account.fullName));
  return (
    <Alert variant="success" className="mt-4 flex items-start gap-2.5">
      <CheckCircle2
        className="mt-0.5 h-4 w-4 shrink-0 text-success-foreground"
        aria-hidden="true"
      />
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-secondary-foreground">{text}</p>
      </div>
    </Alert>
  );
}

/** Cuota del plan, extra, total con lo usado y vencimiento, siempre en texto (decisión 12). */
function LimitsFacts({ limits }: { readonly limits: AccountLimits }): React.JSX.Element {
  const status = limits.status === 'none' ? 'personal' : limits.status;
  const total = limits.totalQuotaBytes ?? '0';
  return (
    <dl className="mt-3 text-sm">
      <Fact term="Cuota del plan">
        <span className="tabular-nums">{bytesText(limits.baseQuotaBytes)}</span>
      </Fact>
      <Fact term="Espacio extra">
        <span className="tabular-nums">
          {hasExtra(limits) ? `+ ${bytesText(limits.extraQuotaBytes)}` : 'Sin extra'}
        </span>
        <Note>
          {hasExtra(limits)
            ? `Hasta el ${untilText(limits)}. Se suma al plan; no reemplaza el espacio usado.`
            : 'Espacio temporal sin cambiar de plan.'}
        </Note>
      </Fact>
      <Fact term="Cuota total">
        <span className="tabular-nums">{bytesText(total)}</span>
        <Note>{`${bytesText(limits.usedBytes)} usados (${String(usedPercent(limits.usedBytes, total))} %)`}</Note>
      </Fact>
      <Fact term="Vencimiento">
        <span className="tabular-nums">{expiryText(limits)}</span>
        <Note>{EXPIRY_NOTES[status]}</Note>
      </Fact>
    </dl>
  );
}

interface ActionProps {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly onClick: () => void;
  readonly buttonRef: React.RefObject<HTMLButtonElement | null>;
  readonly className?: string;
}

function LimitsAction({ label, icon: Icon, onClick, buttonRef, className }: ActionProps) {
  return (
    <Button ref={buttonRef} variant="outline" className={className} onClick={onClick}>
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
}

/** «Ajustar cuota», «Extender vigencia» (no en Personal) y «Quitar extra»; el foco vuelve al botón que abrió. */
function LimitsActions({
  limits,
  flow,
}: {
  readonly limits: AccountLimits;
  readonly flow: LimitsFlow;
}): React.JSX.Element {
  const quotaRef = useReturnFocus(flow.dialog === 'quota');
  const validityRef = useReturnFocus(flow.dialog === 'validity');
  const removeRef = useReturnFocus(flow.dialog === 'removeExtra');
  React.useEffect(() => {
    if (flow.notice === 'quotaRemoved') quotaRef.current?.focus();
  }, [flow.notice, quotaRef]);
  const canExtend = limits.status !== 'personal' && limits.expiresAt !== null;
  return (
    <div className="mt-4 flex flex-col gap-2.5 border-t border-border pt-4 sm:flex-row sm:flex-wrap">
      <LimitsAction
        label="Ajustar cuota"
        icon={HardDrive}
        buttonRef={quotaRef}
        onClick={() => flow.open('quota')}
      />
      {canExtend ? (
        <LimitsAction
          label="Extender vigencia"
          icon={CalendarDays}
          buttonRef={validityRef}
          onClick={() => flow.open('validity')}
        />
      ) : null}
      {canRemoveExtra(limits) ? (
        <LimitsAction
          label="Quitar extra"
          icon={CircleX}
          buttonRef={removeRef}
          className="sm:ml-auto"
          onClick={() => flow.open('removeExtra')}
        />
      ) : null}
    </div>
  );
}

interface DialogsProps extends LimitsProps {
  readonly limits: AccountLimits;
  readonly flow: LimitsFlow;
}

function LimitsDialogs({ account, api, limits, flow }: DialogsProps): React.JSX.Element | null {
  if (flow.dialog === 'quota') {
    return (
      <QuotaAdjustDialog
        clientName={account.fullName}
        limits={limits}
        adjust={(request) => api.adjustQuota(account.id, request)}
        onSaved={flow.saved('quotaSaved')}
        onClose={flow.close}
      />
    );
  }
  if (flow.dialog === 'validity' && limits.expiresAt !== null) {
    const readOnly = limits.status === 'readOnly';
    return (
      <ValidityAdjustDialog
        clientName={account.fullName}
        expiresAt={limits.expiresAt}
        readOnly={readOnly}
        adjust={(request) => api.adjustValidity(account.id, request)}
        onSaved={flow.saved(readOnly ? 'validityReactivated' : 'validitySaved')}
        onClose={flow.close}
      />
    );
  }
  return <RemoveExtraDialog account={account} limits={limits} flow={flow} />;
}

function RemoveExtraDialog({ account, limits, flow }: Omit<DialogsProps, 'api'>) {
  return (
    <ConfirmDestructiveDialog
      open={flow.dialog === 'removeExtra'}
      onOpenChange={(open) => {
        if (!open) flow.close();
      }}
      title={`Quitar el espacio extra de ${account.fullName}`}
      description={removeDescription(limits)}
      confirmLabel="Quitar extra"
      pendingLabel="Quitando extra…"
      pending={flow.removing}
      onConfirm={flow.removeExtra}
    />
  );
}

/** Los límites de una cuenta con suscripción: aviso, datos, acciones y diálogos. */
function LimitsReady({
  account,
  api,
  limits,
  onChanged,
}: LimitsProps & {
  readonly limits: AccountLimits;
  readonly onChanged: (limits: AccountLimits) => void;
}): React.JSX.Element {
  const flow = useLimitsFlow({ account, api, onChanged });
  const badge = BADGES[limits.status === 'none' ? 'personal' : limits.status];
  return (
    <>
      <div className="mt-3">
        <StatusBadge tone={badge.tone} icon={badge.icon} label={badge.label} />
      </div>
      <LimitsNotice flow={flow} limits={limits} account={account} />
      <LimitsFacts limits={limits} />
      <LimitsActions limits={limits} flow={flow} />
      <p className="mt-3 flex items-start gap-2 text-sm text-secondary-foreground">
        <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Cada ajuste queda en la auditoría de la cuenta; el cliente ve la acción y tu rol.
      </p>
      <LimitsDialogs account={account} api={api} limits={limits} flow={flow} />
    </>
  );
}

/** Lo que se ve mientras no hay límites: cargando, sin permiso, cuenta no encontrada o error con «Reintentar». */
function LimitsUnavailable({ load }: { readonly load: AccountLimitsLoad }): React.ReactNode {
  const { state } = load;
  if (state.status === 'loading') {
    return (
      <StateView type="loading" title="Cargando la cuota y la vigencia…" className="mt-4 min-h-0" />
    );
  }
  if (state.status === 'forbidden') return <ForbiddenState role="ADMIN" />;
  if (state.status === 'notFound') {
    return (
      <StateView
        type="empty"
        icon={UserX}
        className="mt-4 min-h-0"
        title="No encontramos esta cuenta."
        description="Vuelve a Cuentas y búscala por su correo."
      />
    );
  }
  return (
    <StateView
      type="error"
      className="mt-4 min-h-0"
      title="No pudimos cargar la cuota y la vigencia."
      description="Ningún dato cambió. Revisa tu conexión e inténtalo de nuevo."
      action={{ label: 'Reintentar', onClick: load.retry, variant: 'outline' }}
    />
  );
}

/** Los límites, una cuenta sin suscripción o lo que se ve mientras no hay límites. */
function LimitsBody({ load, ...props }: LimitsProps & { readonly load: AccountLimitsLoad }) {
  const { state } = load;
  if (state.status !== 'ready') return <LimitsUnavailable load={load} />;
  if (state.limits.status === 'none') return <NoSubscription />;
  return <LimitsReady {...props} limits={state.limits} onChanged={load.replace} />;
}

function NoSubscription(): React.JSX.Element {
  return (
    <InfoNote
      icon={Info}
      className="mt-4"
      title="Esta cuenta no tiene suscripción."
      text="No hay cuota ni vigencia que ajustar. Mientras no contrate un plan, usa el plan Personal."
    />
  );
}

/**
 * «Límites y vigencia» de un cliente (011b HU-5, CA-1, CA-2, CA-7, CA-17; mockups `backoffice/admin--*`): cuota del
 * plan, extra, total y vencimiento, con ajustar o quitar la cuota y extender la vigencia.
 */
export function AccountLimitsCard({ account, api }: LimitsProps): React.JSX.Element {
  const load = useAccountLimits(api.getAccountLimits, account.id);
  return (
    <div className="mt-5">
      <ProfileCard
        id="limites-cuenta"
        title="Límites y vigencia"
        subtitle="Cuota, espacio extra y vencimiento de la suscripción."
      >
        <LimitsBody load={load} account={account} api={api} />
      </ProfileCard>
    </div>
  );
}
