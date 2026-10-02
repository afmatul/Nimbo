import type { SpaceSummaryResponse } from '@nimbo/contracts';
import { CircleAlert } from 'lucide-react';
import type * as React from 'react';

import {
  QuotaBar,
  QuotaLink,
  quotaNoticeOf,
  quotaPercentOf,
} from '../../../components/nimbo/quota-bar';
import { SPACE_PATH } from '../routes';

import type { SpaceSummaryState } from './space-provider';

const CARD_LABEL = 'Almacenamiento';

export interface SidebarQuotaProps {
  readonly state: SpaceSummaryState;
  /** En el propio resumen la tarjeta no lleva enlaces (mockup `resumen-espacio`). */
  readonly linked?: boolean;
}

function ReadyQuota({
  summary,
  linked,
}: {
  readonly summary: SpaceSummaryResponse;
  readonly linked: boolean;
}): React.JSX.Element {
  const hasNotice = quotaNoticeOf(quotaPercentOf(summary.usedBytes, summary.quotaBytes)) !== null;
  return (
    <>
      <QuotaBar
        label={CARD_LABEL}
        usedBytes={summary.usedBytes}
        quotaBytes={summary.quotaBytes}
        {...(linked ? { freeSpaceHref: SPACE_PATH } : {})}
      />
      {linked && !hasNotice ? <QuotaLink href={SPACE_PATH}>Ver detalle</QuotaLink> : null}
    </>
  );
}

function QuotaBody({ state, linked }: Required<SidebarQuotaProps>): React.JSX.Element {
  if (state.status === 'loading') {
    return (
      <p role="status" className="text-xs font-medium text-muted-foreground">
        Calculando tu espacio…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p className="flex items-start gap-1.5 text-xs font-medium text-secondary-foreground">
        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
        <span>No pudimos calcular tu espacio.</span>
      </p>
    );
  }
  return <ReadyQuota summary={state.summary} linked={linked} />;
}

/**
 * Tarjeta de cuota de la barra lateral (spec 007, mockup `shared/layout` cuota-70 y cuota-90): `QuotaBar` con sus
 * tramos y «Liberar espacio»; bajo el 70 %, «Ver detalle». Ambos llevan a `/espacio` (CA-5, CA-7, D-19 d). Si el
 * resumen falla lo dice sin barra y la navegación sigue usable (CA-8). Sin ofertas de ampliación.
 */
export function SidebarQuota({ state, linked = true }: SidebarQuotaProps): React.JSX.Element {
  return (
    <section
      aria-label={CARD_LABEL}
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3.5 py-3"
    >
      {state.status === 'ready' ? null : (
        <p className="text-xs font-semibold text-foreground">{CARD_LABEL}</p>
      )}
      <QuotaBody state={state} linked={linked} />
    </section>
  );
}
