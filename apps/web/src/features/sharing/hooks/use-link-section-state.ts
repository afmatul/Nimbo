'use client';

import * as React from 'react';

import type { ShareMessage } from '../share-messages';

/** Lo abierto en la sección «Enlace público»; también es el botón que lo abrió, adonde vuelve el foco (013c CA-15). */
export type OpenPart = 'idle' | 'create' | 'replace' | 'revoke';
export type Opener = Exclude<OpenPart, 'idle'>;

/** Lo que la sección recuerda de la interacción (013c CA-7 a CA-11, CA-14, CA-15). */
export interface LinkSectionState {
  readonly open: OpenPart;
  /** Botón que toma el foco al volver a montarse (cancelar o revocar, R-2). */
  readonly focusTo: Opener | null;
  /** Aviso de «revocamos el enlace» (CA-9). */
  readonly revoked: boolean;
  /** `404` del enlace al revocar: el aviso con «Actualizar» (CA-14, I-2). */
  readonly gone: ShareMessage | null;
  /** `403` de solo lectura al generar: la sección se comporta como en solo lectura (CA-10). */
  readonly lateReadOnly: boolean;
  /** Generar, reemplazar o revocar en curso: el diálogo no se cierra (CA-11). */
  readonly working: boolean;
  /** La URL a la vista viene de reemplazar (CA-8). */
  readonly replaced: boolean;
}

/** Cambios con nombre del estado de la sección; son estables entre renders. */
export interface LinkSectionActions {
  /** Abre el formulario o la confirmación y olvida el aviso anterior. */
  readonly openPart: (part: Opener) => void;
  /** Cierra lo abierto y devuelve el foco al botón que lo abrió (CA-11, CA-15). */
  readonly cancel: () => void;
  /** Cierra lo abierto sin mover el foco. */
  readonly close: () => void;
  readonly startWork: () => void;
  readonly endWork: () => void;
  readonly generated: () => void;
  readonly revoked: () => void;
  readonly linkGone: (message: ShareMessage) => void;
  readonly markReadOnly: () => void;
}

const INITIAL: LinkSectionState = {
  open: 'idle',
  focusTo: null,
  revoked: false,
  gone: null,
  lateReadOnly: false,
  working: false,
  replaced: false,
};

type Transition = (state: LinkSectionState) => LinkSectionState;

const openPart =
  (part: Opener): Transition =>
  (state) => ({ ...state, open: part, focusTo: null, revoked: false });
const cancel: Transition = (state) => ({
  ...state,
  open: 'idle',
  focusTo: state.open === 'idle' ? state.focusTo : state.open,
  gone: null,
});
const close: Transition = (state) => ({ ...state, open: 'idle', gone: null });
const generated: Transition = (state) => ({
  ...state,
  open: 'idle',
  replaced: state.open === 'replace',
});
const revoked: Transition = (state) => ({
  ...state,
  open: 'idle',
  focusTo: 'create',
  revoked: true,
});

/** Las acciones con nombre sobre un único `setState`: cada una es una transición pura. */
function actionsOver(
  set: React.Dispatch<React.SetStateAction<LinkSectionState>>,
): LinkSectionActions {
  return {
    openPart: (part) => set(openPart(part)),
    cancel: () => set(cancel),
    close: () => set(close),
    startWork: () => set((state) => ({ ...state, working: true })),
    endWork: () => set((state) => ({ ...state, working: false })),
    generated: () => set(generated),
    revoked: () => set(revoked),
    linkGone: (message) => set((state) => ({ ...state, gone: message })),
    markReadOnly: () => set((state) => ({ ...state, lateReadOnly: true })),
  };
}

/** Estado de la interacción de la sección «Enlace público» y las acciones que lo cambian. */
export function useLinkSectionState(): readonly [LinkSectionState, LinkSectionActions] {
  const [state, setState] = React.useState(INITIAL);
  const actions = React.useMemo(() => actionsOver(setState), []);
  return [state, actions] as const;
}
