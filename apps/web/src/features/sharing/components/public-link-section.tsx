'use client';

import type { PublicLinkSummary } from '@nimbo/contracts';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Link2Off,
  LinkIcon,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import * as React from 'react';

import { ReadOnlyBanner } from '../../../components/nimbo/read-only-banner';
import { StatusBadge } from '../../../components/nimbo/status-badge';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { expiresAtLabel } from '../../../lib/format-date';
import { RENEW_PATH } from '../../billing/routes';
import { useReadOnlyAccount } from '../../storage/components/space-provider';
import { usePendingConfirm, type PendingConfirm } from '../../storage/hooks/use-pending-confirm';
import {
  usePublicLink,
  type PublicLinkChoice,
  type PublicLinkState,
} from '../hooks/use-public-link';
import { publicLinkMessageOf, type ShareMessage } from '../share-messages';
import type { SharingApi } from '../sharing-api';

import { GeneratedLinkField } from './generated-link-field';
import { PublicLinkForm } from './public-link-form';
import { ShareErrorAlert } from './share-error-alert';

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

/** Lo abierto en la sección; también es el botón que lo abrió, adonde vuelve el foco al cancelar (CA-15). */
type OpenPart = 'idle' | 'create' | 'replace' | 'revoke';
type Opener = Exclude<OpenPart, 'idle'>;

const TEXT = {
  loading: 'Cargando el enlace público…',
  help: 'Cualquiera con el enlace puede descargar este archivo, sin cuenta en Nimbo.',
  generated: 'Generamos el enlace. Cópialo ahora: por seguridad, no podrás volver a verlo.',
  replaced:
    'Generamos otro enlace y el anterior dejó de funcionar. Cópialo ahora: por seguridad, no podrás volver a verlo.',
  note: 'Por seguridad, el enlace solo se ve al generarlo. Si lo perdiste, genera otro: el actual dejará de funcionar.',
  replaceWarning: 'El enlace actual dejará de funcionar para quien lo tenga.',
  revokeQuestion: '¿Revocar el enlace? Quien lo tenga ya no podrá descargar el archivo.',
  revoked: 'Revocamos el enlace. Ya no sirve para descargar el archivo.',
  revoking: 'Revocando…',
  readOnlyTitle: 'Tu cuenta está en solo lectura.',
  readOnly: 'No puedes generar enlaces. Para hacerlo, renueva tu plan.',
} as const;

const ACTIONS_CLASS = 'flex flex-wrap gap-2';
const FULL_ON_MOBILE = 'w-full sm:w-auto';
/** `outline` sobre el fondo tintado: borde `secondary-foreground` para llegar a 3:1 (PD-189). */
const OUTLINE_ON_TINT = 'border-secondary-foreground text-foreground';
const SPINNER_CLASS = 'h-4 w-4 animate-spin motion-reduce:animate-none';

/** El botón toma el foco al montarse si es al que debe volver (CA-15, R-2). */
function useFocusOnMount(active: boolean): React.RefObject<HTMLButtonElement | null> {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (active) ref.current?.focus();
  }, [active]);
  return ref;
}

/** Revocar con su progreso y su error por `code` (CA-9, CA-13, CA-14); al salir bien el foco va a «Crear» (R-2). */
function useRevoke(state: PublicLinkState, view: SectionView) {
  const linkId = state.reading.status === 'ready' ? state.reading.link?.id : undefined;
  return usePendingConfirm<ShareMessage>(
    async () => {
      if (linkId === undefined) return;
      await state.revoke(linkId);
      view.setNotice(TEXT.revoked);
      view.setFocusTo('create');
    },
    () => view.setOpen('idle'),
    publicLinkMessageOf,
  );
}

/** Lo que la sección recuerda de la interacción: qué está abierto, adónde va el foco y los avisos. */
function useSectionView() {
  const [open, setOpen] = React.useState<OpenPart>('idle');
  const [focusTo, setFocusTo] = React.useState<Opener | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [lateReadOnly, setLateReadOnly] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [replaced, setReplaced] = React.useState(false);
  const openPart = (part: Opener): void => {
    setNotice(null);
    setFocusTo(null);
    setOpen(part);
  };
  return {
    open,
    setOpen,
    focusTo,
    setFocusTo,
    notice,
    setNotice,
    lateReadOnly,
    setLateReadOnly,
    generating,
    setGenerating,
    replaced,
    setReplaced,
    openPart,
  };
}

type SectionView = ReturnType<typeof useSectionView>;

/** Genera con lo elegido; informa la acción en curso para que el diálogo no se cierre (CA-11). */
function useGenerate(state: PublicLinkState, view: SectionView) {
  return async (choice: PublicLinkChoice): Promise<void> => {
    view.setGenerating(true);
    try {
      await state.create(choice);
      view.setReplaced(view.open === 'replace');
      view.setOpen('idle');
    } finally {
      view.setGenerating(false);
    }
  };
}

/** Cancela lo abierto y devuelve el foco al botón que lo abrió (CA-11, CA-15). */
function useCancel(view: SectionView, revoke: PendingConfirm<ShareMessage>) {
  return (): boolean => {
    if (view.open === 'idle') return false;
    view.setFocusTo(view.open);
    if (view.open === 'revoke') revoke.close();
    else view.setOpen('idle');
    return true;
  };
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

function LoadingLink(): React.JSX.Element {
  return (
    <p role="status" className="flex items-center gap-2 py-1 text-sm text-secondary-foreground">
      <Loader2 className={SPINNER_CLASS} aria-hidden="true" />
      {TEXT.loading}
    </p>
  );
}

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
          <span>{`${active ? 'Vence' : 'Venció'} el ${expiresAtLabel(link.expiresAt)}`}</span>
          <span aria-hidden="true">·</span>
          <span>{link.hasPassword ? 'Con contraseña' : 'Sin contraseña'}</span>
        </p>
        <p className={meta}>{`Creado el ${expiresAtLabel(link.createdAt)}`}</p>
      </div>
    </div>
  );
}

/** Sin enlace: la ayuda y «Crear enlace público» en `outline` (CA-1, D-2). */
function NoLink({ view }: { readonly view: SectionView }): React.JSX.Element {
  const ref = useFocusOnMount(view.focusTo === 'create');
  return (
    <>
      <p className="text-sm text-secondary-foreground">{TEXT.help}</p>
      <div className={ACTIONS_CLASS}>
        <Button
          ref={ref}
          type="button"
          variant="outline"
          className={FULL_ON_MOBILE}
          onClick={() => view.openPart('create')}
        >
          <LinkIcon aria-hidden="true" className="h-4 w-4" />
          Crear enlace público
        </Button>
      </div>
    </>
  );
}

interface LinkActionsProps {
  readonly view: SectionView;
  readonly readOnly: boolean;
}

/** «Generar otro enlace» (no en solo lectura, CA-10) y «Revocar enlace», que sigue disponible (013 CA-5). */
function LinkActions({ view, readOnly }: LinkActionsProps): React.JSX.Element {
  const replaceRef = useFocusOnMount(view.focusTo === 'replace');
  const revokeRef = useFocusOnMount(view.focusTo === 'revoke');
  return (
    <div className={ACTIONS_CLASS}>
      {readOnly ? null : (
        <Button
          ref={replaceRef}
          type="button"
          variant="outline"
          className={FULL_ON_MOBILE}
          onClick={() => view.openPart('replace')}
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
        onClick={() => view.openPart('revoke')}
      >
        <Link2Off aria-hidden="true" className="h-4 w-4" />
        Revocar enlace
      </Button>
    </div>
  );
}

interface RevokeProps {
  readonly revoke: PendingConfirm<ShareMessage>;
  readonly onCancel: () => void;
}

/** «Cancelar» con el foco al abrir y el destructivo arriba a 360 px; «Revocando…» pasados 2 s (CA-9, D-1). */
function RevokeButtons({ revoke, onCancel }: RevokeProps): React.JSX.Element {
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

/** Confirmación en línea, sin otro diálogo (D-1, `ui-guidelines.md` §4): recuadro `destructive` al 5 %. */
function RevokeConfirm({ revoke, onCancel }: RevokeProps): React.JSX.Element {
  const id = React.useId();
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="space-y-3 rounded-md border border-destructive-soft/50 bg-destructive/5 px-4 py-3"
    >
      <p id={id} className="text-sm font-medium text-foreground">
        {TEXT.revokeQuestion}
      </p>
      {revoke.failure === null ? null : (
        <ShareErrorAlert
          message={revoke.failure}
          handlers={{ retry: () => void revoke.confirm() }}
        />
      )}
      <RevokeButtons revoke={revoke} onCancel={onCancel} />
      <p role="status" className="sr-only">
        {revoke.slow ? TEXT.revoking : ''}
      </p>
    </div>
  );
}

/** Aviso de éxito con ícono (generar, reemplazar, revocar; mockup `enlace-generado`, `enlace-revocado`). */
function SuccessNotice({ children }: { readonly children: string }): React.JSX.Element {
  return (
    <Alert variant="success" className="flex items-start gap-3">
      <CheckCircle2
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 text-success-foreground"
      />
      <p className="min-w-0 flex-1">{children}</p>
    </Alert>
  );
}

interface SectionParts {
  readonly fileId: string;
  readonly state: PublicLinkState;
  readonly view: SectionView;
  readonly revoke: PendingConfirm<ShareMessage>;
  readonly cancel: CancelOpenPart;
  readonly generate: (choice: PublicLinkChoice) => Promise<void>;
  readonly readOnly: boolean;
}

interface LinkPartProps {
  readonly parts: SectionParts;
  readonly link: PublicLinkSummary | null;
}

/** El formulario de crear o de reemplazar; reemplazar un enlace activo lleva la advertencia (CA-8, D-5). */
function LinkForm({ parts, link }: LinkPartProps): React.JSX.Element {
  return (
    <div className="space-y-3">
      {link?.status === 'active' ? (
        <Alert variant="warning" className="flex items-start gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="min-w-0 flex-1">{TEXT.replaceWarning}</p>
        </Alert>
      ) : null}
      <PublicLinkForm
        fileId={parts.fileId}
        onGenerate={parts.generate}
        onCancel={() => void parts.cancel()}
        onReadOnly={() => parts.view.setLateReadOnly(true)}
        replacing={link !== null}
      />
    </div>
  );
}

/** Lo que va bajo el resumen: el formulario, la confirmación o la nota y las acciones (CA-7 a CA-10). */
function BelowSummary({
  parts,
  link,
}: {
  readonly parts: SectionParts;
  readonly link: PublicLinkSummary;
}) {
  const { view, revoke, readOnly } = parts;
  if (view.open === 'replace') return <LinkForm parts={parts} link={link} />;
  if (view.open === 'revoke')
    return <RevokeConfirm revoke={revoke} onCancel={() => void parts.cancel()} />;
  return (
    <>
      {link.status === 'active' && !readOnly ? (
        <p className="text-sm text-muted-foreground">{TEXT.note}</p>
      ) : null}
      <LinkActions view={view} readOnly={readOnly} />
    </>
  );
}

/** `404` del enlace al revocar: el aviso con «Actualizar», que vuelve a pedir el estado (CA-14, I-2). */
function GoneLinkAlert({ parts }: { readonly parts: SectionParts }): React.JSX.Element | null {
  const { revoke, state } = parts;
  if (revoke.failure?.fix !== 'reload') return null;
  const reload = (): void => {
    revoke.close();
    state.reload();
  };
  return <ShareErrorAlert message={revoke.failure} handlers={{ reload }} />;
}

function WithLink({
  parts,
  link,
}: {
  readonly parts: SectionParts;
  readonly link: PublicLinkSummary;
}) {
  if (parts.revoke.failure?.fix === 'reload') {
    return (
      <>
        <GoneLinkAlert parts={parts} />
        <LinkSummary link={link} />
      </>
    );
  }
  return (
    <>
      <LinkSummary link={link} />
      <BelowSummary parts={parts} link={link} />
    </>
  );
}

/** Sin enlace: el formulario abierto, nada en solo lectura (CA-10) o la ayuda con «Crear enlace público». */
function WithoutLink({ parts }: { readonly parts: SectionParts }): React.JSX.Element | null {
  if (parts.view.open === 'create') return <LinkForm parts={parts} link={null} />;
  if (parts.readOnly) return null;
  return <NoLink view={parts.view} />;
}

/** La URL recién generada, solo mientras el diálogo siga abierto (CA-3, CA-8, RN-1). */
function GeneratedView({ parts }: { readonly parts: SectionParts }): React.JSX.Element | null {
  const { generated } = parts.state;
  if (generated === null) return null;
  return (
    <>
      <SuccessNotice>{parts.view.replaced ? TEXT.replaced : TEXT.generated}</SuccessNotice>
      <GeneratedLinkField generated={generated} />
    </>
  );
}

/** Estado de la lectura (CA-1, CA-13, CA-14) o, si se acaba de generar, la URL. */
function SectionBody({ parts }: { readonly parts: SectionParts }): React.JSX.Element | null {
  const { reading, generated, reload } = parts.state;
  if (generated !== null) return <GeneratedView parts={parts} />;
  if (reading.status === 'loading') return <LoadingLink />;
  if (reading.status === 'error') {
    const message = publicLinkMessageOf(reading.error);
    return <ShareErrorAlert message={message} handlers={{ retry: reload, reload }} />;
  }
  if (reading.link === null) return <WithoutLink parts={parts} />;
  return <WithLink parts={parts} link={reading.link} />;
}

/** Arma las piezas de la sección y la conecta con el diálogo (Escape, acción en curso). */
function useSectionParts(props: PublicLinkSectionProps): SectionParts {
  const state = usePublicLink(props.api, props.fileId);
  const view = useSectionView();
  const revoke = useRevoke(state, view);
  const cancel = useCancel(view, revoke);
  const generate = useGenerate(state, view);
  const { readOnly } = useReadOnlyAccount();
  useDialogBridge(props, cancel, view.generating || revoke.pending);
  const parts = { fileId: props.fileId, state, view, revoke, cancel, generate };
  return { ...parts, readOnly: readOnly || view.lateReadOnly };
}

/**
 * Sección «Enlace público» del diálogo «Compartir» (spec 013c CA-1, CA-7 a CA-11, CA-13 a CA-15; mockup
 * `sharing/compartir`, `compartir--enlace-*`): estado del enlace, generar, reemplazar y revocar con confirmaciones en
 * línea (D-1), solo lectura con `ReadOnlyBanner` (CA-10) y la URL solo en memoria (RN-1). Solo para archivos (CA-2).
 */
export function PublicLinkSection(props: PublicLinkSectionProps): React.JSX.Element {
  const parts = useSectionParts(props);
  const headingId = React.useId();
  const busy =
    parts.view.generating || parts.revoke.pending || parts.state.reading.status === 'loading';
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
      {parts.view.notice === null ? null : <SuccessNotice>{parts.view.notice}</SuccessNotice>}
      <SectionBody parts={parts} />
    </section>
  );
}
