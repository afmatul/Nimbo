'use client';

import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import type { PendingConfirm } from '../../storage/hooks/use-pending-confirm';
import type { LinkSectionActions } from '../hooks/use-link-section-state';
import type { PublicLinkState } from '../hooks/use-public-link';
import { useRevokeLink, type RevokeLinkActions } from '../hooks/use-revoke-link';
import type { ShareMessage } from '../share-messages';

import { FULL_ON_MOBILE, OUTLINE_ON_TINT, SPINNER_CLASS } from './public-link-section-styles';
import { ShareErrorAlert } from './share-error-alert';
import { useFocusOnMount } from './use-focus-on-mount';

const TEXT = {
  question: '¿Revocar el enlace? Quien lo tenga ya no podrá descargar el archivo.',
  revoking: 'Revocando…',
} as const;

interface RevokeButtonsProps {
  readonly revoke: PendingConfirm<ShareMessage>;
  readonly onCancel: () => void;
}

/** «Cancelar» con el foco al abrir y el destructivo arriba a 360 px; «Revocando…» pasados 2 s (CA-9, D-1). */
function RevokeButtons({ revoke, onCancel }: RevokeButtonsProps): React.JSX.Element {
  const cancelRef = useFocusOnMount(true);
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row">
      <Button
        ref={cancelRef}
        type="button"
        variant="outline"
        className={`${FULL_ON_MOBILE} ${OUTLINE_ON_TINT}`}
        disabled={revoke.pending}
        onClick={onCancel}
      >
        Cancelar
      </Button>
      <Button
        type="button"
        variant="destructive"
        className={`${FULL_ON_MOBILE} aria-disabled:cursor-progress`}
        aria-disabled={revoke.slow || undefined}
        onClick={() => void revoke.confirm()}
      >
        {revoke.slow ? <Loader2 aria-hidden="true" className={SPINNER_CLASS} /> : null}
        {revoke.slow ? TEXT.revoking : 'Revocar enlace'}
      </Button>
    </div>
  );
}

export interface RevokeConfirmProps {
  /** El enlace que se revoca: la confirmación solo existe mientras hay enlace (m-8). */
  readonly linkId: string;
  readonly revoke: PublicLinkState['revoke'];
  readonly actions: RevokeLinkActions & Pick<LinkSectionActions, 'cancel'>;
}

/**
 * Confirmación de revocar en línea, sin otro diálogo (013c CA-9, D-1, `ui-guidelines.md` §4): recuadro `destructive`
 * al 5 %, el error con «Reintentar» (CA-13) y el progreso anunciado.
 */
export function RevokeConfirm({ linkId, revoke, actions }: RevokeConfirmProps): React.JSX.Element {
  const pending = useRevokeLink(linkId, revoke, actions);
  const id = React.useId();
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="space-y-3 rounded-md border border-destructive-soft/50 bg-destructive/5 px-4 py-3"
    >
      <p id={id} className="text-sm font-medium text-foreground">
        {TEXT.question}
      </p>
      {pending.failure === null ? null : (
        <ShareErrorAlert
          message={pending.failure}
          handlers={{ retry: () => void pending.confirm() }}
        />
      )}
      <RevokeButtons revoke={pending} onCancel={actions.cancel} />
      <p role="status" className="sr-only">
        {pending.slow ? TEXT.revoking : ''}
      </p>
    </div>
  );
}
