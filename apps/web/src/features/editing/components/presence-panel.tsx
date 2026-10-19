'use client';

import type { EditingPresence, Participant } from '@nimbo/contracts';
import { AlertCircle, Eye, History, Pencil } from 'lucide-react';
import * as React from 'react';

import { ParticipantAvatar } from '../../../components/nimbo/participant-avatar';
import { cn } from '../../../lib/utils';
import { EDITING_FOOTER, type ReadOnlyCopy } from '../read-only-copy';

/** Quien abre la pantalla: su nombre visible es el de su cuenta (RN-12). */
export interface Viewer {
  readonly id: string;
  readonly name: string;
}

export interface PresencePanelProps {
  readonly id: string;
  readonly presence: EditingPresence;
  /** Motivo de solo lectura; `null` en edición. */
  readonly readOnly: ReadOnlyCopy | null;
  readonly me: Viewer;
  /** En móvil la lista se despliega con el botón de la barra; en escritorio siempre se ve. */
  readonly expanded: boolean;
}

const TITLE_ID = 'presencia-titulo';

/** «N de L editores» frente al límite del plan de la cuenta propietaria (CA-7, RN-3). */
export function editorCountLabel({ editors, maxEditors }: EditingPresence): string {
  return `${String(editors)} de ${String(maxEditors)} editores`;
}

/** «Estás editando con 2 personas más» (spec §6), sin contarse a uno mismo. */
export function coEditingLabel(participants: readonly Participant[], meId: string): string {
  const others = participants.filter((participant) => participant.userId !== meId).length;
  if (others === 0) return 'Solo tú estás editando';
  return `Estás editando con ${String(others)} ${others === 1 ? 'persona' : 'personas'} más`;
}

function remainingLabel(remaining: number): string {
  return remaining === 1
    ? 'Queda 1 lugar para editar a la vez'
    : `Quedan ${String(remaining)} lugares para editar a la vez`;
}

/**
 * Lista de participantes conectados con sus nombres reales y el conteo frente al límite (CA-6, CA-7). Quien solo ve
 * aparece aparte y no cuenta para el límite (P-6). El conteo se anuncia con `aria-live`.
 */
export function PresencePanel(props: PresencePanelProps): React.JSX.Element {
  const { id, presence, readOnly, me, expanded } = props;
  return (
    <aside
      id={id}
      aria-labelledby={TITLE_ID}
      className={cn(
        'order-first flex-col gap-4 border-b border-border bg-card p-4 lg:order-last lg:flex lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-l',
        expanded ? 'flex' : 'hidden',
      )}
    >
      <h2
        id={TITLE_ID}
        className="text-xs font-semibold uppercase tracking-wide text-secondary-foreground"
      >
        En este documento
      </h2>
      <div aria-live="polite" className="space-y-1 text-sm">
        <PresenceSummary presence={presence} readOnly={readOnly} />
        {readOnly === null ? (
          <p className="text-foreground">{coEditingLabel(presence.participants, me.id)}</p>
        ) : null}
      </div>
      <ParticipantList participants={presence.participants} meId={me.id} />
      {readOnly === null ? null : <ViewerSection me={me} />}
      <PresenceFooter text={readOnly?.footer ?? EDITING_FOOTER} />
    </aside>
  );
}

function PresenceSummary({
  presence,
  readOnly,
}: Pick<PresencePanelProps, 'presence' | 'readOnly'>): React.JSX.Element {
  if (readOnly?.blockedLabel) {
    return <p className="font-semibold text-foreground">{readOnly.blockedLabel}</p>;
  }
  const remaining = presence.maxEditors - presence.editors;
  return (
    <>
      <p className="font-semibold text-foreground">{editorCountLabel(presence)}</p>
      <EditorMeter presence={presence} />
      {remaining > 0 ? (
        <p className="text-secondary-foreground">{remainingLabel(remaining)}</p>
      ) : (
        <p className="flex items-center gap-1 font-medium text-warning-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Límite del plan alcanzado
        </p>
      )}
    </>
  );
}

/** Una marca por lugar del plan; las ocupadas en `primary`. Decorativo: el conteo ya va en texto. */
function EditorMeter({ presence }: { readonly presence: EditingPresence }): React.JSX.Element {
  const marks = Array.from({ length: presence.maxEditors }, (_, index) => index < presence.editors);
  return (
    <div aria-hidden="true" className="flex gap-1 py-1">
      {marks.map((taken, index) => (
        <span
          key={index}
          className={cn(
            'h-1.5 flex-1 rounded-full',
            taken ? 'bg-primary' : 'border border-input bg-card',
          )}
        />
      ))}
    </div>
  );
}

function ParticipantList({
  participants,
  meId,
}: {
  readonly participants: readonly Participant[];
  readonly meId: string;
}): React.JSX.Element | null {
  if (participants.length === 0) return null;
  return (
    <ul aria-label="Editores" className="space-y-3">
      {participants.map((participant) => (
        <ParticipantRow
          key={participant.userId}
          person={{ id: participant.userId, name: participant.displayName }}
          isMe={participant.userId === meId}
        />
      ))}
    </ul>
  );
}

/** Quien abrió en solo lectura: aparte, porque no cuenta para el límite. */
function ViewerSection({ me }: { readonly me: Viewer }): React.JSX.Element {
  return (
    <section aria-labelledby="presencia-solo-ven" className="space-y-3">
      <h3 id="presencia-solo-ven" className="text-xs font-semibold text-secondary-foreground">
        Solo ven (no cuentan para el límite)
      </h3>
      <ul className="space-y-3">
        <ParticipantRow person={me} isMe viewer />
      </ul>
    </section>
  );
}

function ParticipantRow({
  person,
  isMe,
  viewer = false,
}: {
  readonly person: Viewer;
  readonly isMe: boolean;
  readonly viewer?: boolean;
}): React.JSX.Element {
  const RoleIcon = viewer ? Eye : Pencil;
  return (
    <li className="flex items-center gap-3">
      <ParticipantAvatar userId={person.id} name={person.name} viewer={viewer} />
      <div className="min-w-0 text-sm">
        <p className="wrap-anywhere font-semibold text-foreground">
          {isMe ? `${person.name} (tú)` : person.name}
        </p>
        <p className="flex items-center gap-1 text-secondary-foreground">
          <RoleIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {viewer ? 'Solo ve' : 'Editando'}
        </p>
      </div>
    </li>
  );
}

/** Explica cuándo se guarda (RN-4), para que nadie espere un «Guardar». */
function PresenceFooter({ text }: { readonly text: string }): React.JSX.Element {
  return (
    <p className="mt-auto flex items-start gap-2 border-t border-border pt-3 text-sm text-secondary-foreground">
      <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {text}
    </p>
  );
}
