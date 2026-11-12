'use client';

import type { PublicLinkSummary } from '@nimbo/contracts';
import { Check, Clock, Link2Off, RefreshCw } from 'lucide-react';
import type * as React from 'react';

import { StatusBadge } from '../../../components/nimbo/status-badge';
import { Button } from '../../../components/ui/button';
import { absoluteDateTimeLabel } from '../../../lib/format-date';
import type { LinkSectionState } from '../hooks/use-link-section-state';
import type { ShareMessage } from '../share-messages';

import { LinkFormPanel, type LinkFormHandlers } from './public-link-form-panel';
import { RevokeConfirm, type RevokeConfirmProps } from './public-link-revoke-confirm';
import { ACTIONS_CLASS, FULL_ON_MOBILE } from './public-link-section-styles';
import { ShareErrorAlert } from './share-error-alert';
import { useFocusOnMount } from './use-focus-on-mount';

const NOTE =
  'Por seguridad, el enlace solo se ve al generarlo. Si lo perdiste, genera otro: el actual dejará de funcionar.';

/** «Activo» o «Vencido» con ícono y texto (nunca solo color), vencimiento, contraseña y creación (CA-7). */
function LinkSummary({ link }: { readonly link: PublicLinkSummary }): React.JSX.Element {
  const active = link.status === 'active';
  const meta = 'flex flex-wrap gap-x-1.5 text-sm tabular-nums text-secondary-foreground';
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <StatusBadge
        tone={active ? 'success' : 'neutral'}
        icon={active ? Check : Clock}
        label={active ? 'Activo' : 'Vencido'}
      />
      <div className="grid min-w-0">
        <p className={meta}>
          <span>{`${active ? 'Vence' : 'Venció'} el ${absoluteDateTimeLabel(link.expiresAt)}`}</span>
          <span aria-hidden="true">·</span>
          <span>{link.hasPassword ? 'Con contraseña' : 'Sin contraseña'}</span>
        </p>
        <p className={meta}>{`Creado el ${absoluteDateTimeLabel(link.createdAt)}`}</p>
      </div>
    </div>
  );
}

type LinkOpener = 'replace' | 'revoke';

interface LinkActionsProps {
  readonly focusTo: LinkSectionState['focusTo'];
  readonly readOnly: boolean;
  readonly onOpen: (part: LinkOpener) => void;
}

/** «Generar otro enlace» (no en solo lectura, CA-10) y «Revocar enlace», que sigue disponible (013 CA-5). */
function LinkActions({ focusTo, readOnly, onOpen }: LinkActionsProps): React.JSX.Element {
  const replaceRef = useFocusOnMount(focusTo === 'replace');
  const revokeRef = useFocusOnMount(focusTo === 'revoke');
  return (
    <div className={ACTIONS_CLASS}>
      {readOnly ? null : (
        <Button
          ref={replaceRef}
          type="button"
          variant="outline"
          className={FULL_ON_MOBILE}
          onClick={() => onOpen('replace')}
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Generar otro enlace
        </Button>
      )}
      <Button
        ref={revokeRef}
        type="button"
        variant="outline"
        className={`${FULL_ON_MOBILE} text-destructive hover:text-destructive`}
        onClick={() => onOpen('revoke')}
      >
        <Link2Off aria-hidden="true" className="h-4 w-4" />
        Revocar enlace
      </Button>
    </div>
  );
}

export interface CurrentLinkViewProps extends Omit<LinkActionsProps, 'focusTo'> {
  readonly link: PublicLinkSummary;
  /** Lo abierto, adónde vuelve el foco y el `404` del enlace al revocar (solo lectura del estado). */
  readonly view: Pick<LinkSectionState, 'open' | 'focusTo' | 'gone'>;
  readonly form: LinkFormHandlers;
  readonly revoke: Omit<RevokeConfirmProps, 'linkId'>;
  /** «Actualizar» del `404`: cierra la confirmación y vuelve a pedir el estado (CA-14, I-2). */
  readonly onReload: () => void;
}

/** Lo que va bajo el resumen: el formulario, la confirmación o la nota y las acciones (CA-7 a CA-10). */
function BelowSummary(props: CurrentLinkViewProps): React.JSX.Element {
  const { link, view, readOnly } = props;
  if (view.open === 'replace') return <LinkFormPanel link={link} form={props.form} />;
  if (view.open === 'revoke') return <RevokeConfirm linkId={link.id} {...props.revoke} />;
  return (
    <>
      {link.status === 'active' && !readOnly ? (
        <p className="text-sm text-muted-foreground">{NOTE}</p>
      ) : null}
      <LinkActions focusTo={view.focusTo} readOnly={readOnly} onOpen={props.onOpen} />
    </>
  );
}

interface GoneLinkProps {
  readonly link: PublicLinkSummary;
  readonly message: ShareMessage;
  readonly onReload: () => void;
}

/** `404` del enlace al revocar: el aviso con «Actualizar» sobre el resumen, sin acciones (CA-14, I-2). */
function GoneLink({ link, message, onReload }: GoneLinkProps): React.JSX.Element {
  return (
    <>
      <ShareErrorAlert message={message} handlers={{ reload: onReload }} />
      <LinkSummary link={link} />
    </>
  );
}

/** Con enlace, activo o vencido: su resumen y lo que se puede hacer con él (013c CA-7 a CA-10, CA-14). */
export function CurrentLinkView(props: CurrentLinkViewProps): React.JSX.Element {
  const { link, view, onReload } = props;
  if (view.gone !== null) return <GoneLink link={link} message={view.gone} onReload={onReload} />;
  return (
    <>
      <LinkSummary link={link} />
      <BelowSummary {...props} />
    </>
  );
}
