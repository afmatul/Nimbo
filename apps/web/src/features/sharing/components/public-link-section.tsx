'use client';

import type { CreatedPublicLink, PublicLinkSummary } from '@nimbo/contracts';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { ReadOnlyBanner } from '../../../components/nimbo/read-only-banner';
import { RENEW_PATH } from '../../billing/routes';
import { useReadOnlyAccount } from '../../storage/components/space-provider';
import { useGenerateLink } from '../hooks/use-generate-link';
import {
  useLinkSectionState,
  type LinkSectionActions,
  type LinkSectionState,
} from '../hooks/use-link-section-state';
import { usePublicLink, type PublicLinkState } from '../hooks/use-public-link';
import { publicLinkMessageOf } from '../share-messages';
import type { SharingApi } from '../sharing-api';

import { GeneratedLinkField } from './generated-link-field';
import { CurrentLinkView } from './public-link-current';
import { NoLinkView } from './public-link-empty';
import type { LinkFormHandlers } from './public-link-form-panel';
import { SPINNER_CLASS } from './public-link-section-styles';
import { ShareErrorAlert } from './share-error-alert';
import { SuccessNotice } from './success-notice';

/** Cancela el formulario o la confirmación abiertos; `false` si no había nada que cancelar (CA-11). */
export type CancelOpenPart = () => boolean;

export interface PublicLinkSectionProps {
  readonly api: SharingApi;
  readonly fileId: string;
  /** Generar, reemplazar o revocar en curso: el diálogo no se cierra (CA-11, M-2). */
  readonly onBusyChange: (busy: boolean) => void;
  /** Donde la sección deja su `CancelOpenPart` para que Escape cancele solo lo abierto (plan §1). */
  readonly cancelRef: React.MutableRefObject<CancelOpenPart | null>;
}

const TEXT = {
  loading: 'Cargando el enlace público…',
  generated: 'Generamos el enlace. Cópialo ahora: por seguridad, no podrás volver a verlo.',
  replaced:
    'Generamos otro enlace y el anterior dejó de funcionar. Cópialo ahora: por seguridad, no podrás volver a verlo.',
  revoked: 'Revocamos el enlace. Ya no sirve para descargar el archivo.',
  readOnlyTitle: 'Tu cuenta está en solo lectura.',
  readOnly: 'No puedes generar enlaces. Para hacerlo, renueva tu plan.',
} as const;

/** Lo que la sección lee y las acciones con nombre que sus vistas pueden pedir. */
interface SectionParts {
  readonly link: PublicLinkState;
  readonly view: LinkSectionState;
  readonly actions: LinkSectionActions;
  readonly form: LinkFormHandlers;
  readonly readOnly: boolean;
}

/** Escape cancela lo abierto y dice si había algo (CA-11); la consulta se resuelve antes del comando `cancel`. */
function useCancelOpenPart(view: LinkSectionState, actions: LinkSectionActions): CancelOpenPart {
  const hasOpenPart = view.open !== 'idle';
  return React.useCallback((): boolean => {
    if (!hasOpenPart) return false;
    actions.cancel();
    return true;
  }, [hasOpenPart, actions]);
}

/** Registra el callback de Escape e informa la acción en curso al diálogo (plan §1, M-2). */
function useDialogBridge(props: PublicLinkSectionProps, cancel: CancelOpenPart, busy: boolean) {
  const { cancelRef, onBusyChange } = props;
  React.useEffect(() => {
    cancelRef.current = cancel;
  });
  React.useEffect(() => () => void (cancelRef.current = null), [cancelRef]);
  React.useEffect(() => onBusyChange(busy), [onBusyChange, busy]);
}

/** Arma las piezas de la sección y la conecta con el diálogo (Escape, acción en curso). */
function useSectionParts(props: PublicLinkSectionProps): SectionParts {
  const link = usePublicLink(props.api, props.fileId);
  const [view, actions] = useLinkSectionState();
  const onGenerate = useGenerateLink(link.create, actions);
  const { readOnly } = useReadOnlyAccount();
  useDialogBridge(props, useCancelOpenPart(view, actions), view.working);
  const form = {
    fileId: props.fileId,
    onGenerate,
    onCancel: actions.cancel,
    onReadOnly: actions.markReadOnly,
  };
  return { link, view, actions, form, readOnly: readOnly || view.lateReadOnly };
}

function LoadingLink(): React.JSX.Element {
  return (
    <p role="status" className="flex items-center gap-2 py-1 text-sm text-secondary-foreground">
      <Loader2 className={SPINNER_CLASS} aria-hidden="true" />
      {TEXT.loading}
    </p>
  );
}

interface GeneratedViewProps {
  readonly generated: CreatedPublicLink;
  readonly replaced: boolean;
}

/** La URL recién generada, solo mientras el diálogo siga abierto (CA-3, CA-8, RN-1). */
function GeneratedView({ generated, replaced }: GeneratedViewProps): React.JSX.Element {
  return (
    <>
      <SuccessNotice>{replaced ? TEXT.replaced : TEXT.generated}</SuccessNotice>
      <GeneratedLinkField generated={generated} />
    </>
  );
}

interface CurrentLinkProps {
  readonly parts: SectionParts;
  readonly link: PublicLinkSummary;
}

/** Con enlace: su vista recibe el estado que lee y las acciones con nombre (CA-7 a CA-10, CA-14). */
function CurrentLink({ parts, link }: CurrentLinkProps): React.JSX.Element {
  const { view, actions } = parts;
  const reload = (): void => {
    actions.close();
    parts.link.reload();
  };
  return (
    <CurrentLinkView
      link={link}
      view={view}
      readOnly={parts.readOnly}
      onOpen={actions.openPart}
      form={parts.form}
      revoke={{ revoke: parts.link.revoke, actions }}
      onReload={reload}
    />
  );
}

/** Sin enlace: crear, si la cuenta lo permite (CA-1, CA-10). */
function NoLink({ parts }: { readonly parts: SectionParts }): React.JSX.Element {
  const { view, actions } = parts;
  return (
    <NoLinkView
      creating={view.open === 'create'}
      readOnly={parts.readOnly}
      form={parts.form}
      focus={view.focusTo === 'create'}
      onCreate={() => actions.openPart('create')}
    />
  );
}

/** Estado de la lectura (CA-1, CA-13, CA-14) o, si se acaba de generar, la URL. */
function SectionBody({ parts }: { readonly parts: SectionParts }): React.JSX.Element {
  const { reading, generated, reload } = parts.link;
  if (generated !== null) {
    return <GeneratedView generated={generated} replaced={parts.view.replaced} />;
  }
  if (reading.status === 'loading') return <LoadingLink />;
  if (reading.status === 'error') {
    const message = publicLinkMessageOf(reading.error);
    return <ShareErrorAlert message={message} handlers={{ retry: reload, reload }} />;
  }
  if (reading.link === null) return <NoLink parts={parts} />;
  return <CurrentLink parts={parts} link={reading.link} />;
}

/**
 * Sección «Enlace público» del diálogo «Compartir» (spec 013c CA-1, CA-7 a CA-11, CA-13 a CA-15; mockup
 * `sharing/compartir`, `compartir--enlace-*`): estado del enlace, generar, reemplazar y revocar con confirmaciones en
 * línea (D-1), solo lectura con `ReadOnlyBanner` (CA-10) y la URL solo en memoria (RN-1). Solo para archivos (CA-2).
 */
export function PublicLinkSection(props: PublicLinkSectionProps): React.JSX.Element {
  const parts = useSectionParts(props);
  const headingId = React.useId();
  const busy = parts.view.working || parts.link.reading.status === 'loading';
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
      className="space-y-3 border-t border-border pt-4"
    >
      <h3 id={headingId} className="text-sm font-semibold text-foreground">
        Enlace público
      </h3>
      {parts.readOnly ? (
        <ReadOnlyBanner
          title={TEXT.readOnlyTitle}
          description={TEXT.readOnly}
          renewHref={RENEW_PATH}
        />
      ) : null}
      {parts.view.revoked ? <SuccessNotice>{TEXT.revoked}</SuccessNotice> : null}
      <SectionBody parts={parts} />
    </section>
  );
}
