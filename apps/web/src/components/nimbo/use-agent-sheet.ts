'use client';

import * as React from 'react';

/** Hasta este ancho el panel del agente es una hoja a pantalla completa y modal (020b D-5); por encima, complemento. */
const SHEET_QUERY = '(max-width: 900px)';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function subscribeToSheetQuery(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(SHEET_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const sheetQueryMatches = (): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia(SHEET_QUERY).matches;

/** `true` a ≤ 900 px. En el servidor, escritorio: el panel solo se abre tras una acción en el navegador. */
export function useIsAgentSheet(): boolean {
  return React.useSyncExternalStore(subscribeToSheetQuery, sheetQueryMatches, () => false);
}

/** Hermanos de cada ancestro hasta `body` que aún no están `inert`: el fondo de la hoja. */
function backgroundOf(element: HTMLElement): readonly HTMLElement[] {
  const background: HTMLElement[] = [];
  for (
    let node = element;
    node.parentElement && node !== document.body;
    node = node.parentElement
  ) {
    const siblings = Array.from(node.parentElement.children).filter(
      (sibling): sibling is HTMLElement =>
        sibling !== node && sibling instanceof HTMLElement && !sibling.hasAttribute('inert'),
    );
    background.push(...siblings);
  }
  return background;
}

/** Con la hoja modal, el resto de la página queda `inert`; al cerrar o pasar a escritorio se restituye. */
function useInertBackground(ref: React.RefObject<HTMLElement | null>, isModal: boolean): void {
  React.useEffect(() => {
    const element = ref.current;
    if (!isModal || element === null) return undefined;
    const background = backgroundOf(element);
    background.forEach((node) => node.setAttribute('inert', ''));
    return () => background.forEach((node) => node.removeAttribute('inert'));
  }, [ref, isModal]);
}

const activeElementOf = (): HTMLElement | null =>
  typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

/**
 * Al abrir, lleva el foco al campo de la pregunta (o al primer control); al cerrar, lo devuelve a quien lo abrió. Quien
 * lo abrió se lee en el primer render, antes de que el `inert` del fondo le quite el foco.
 */
function useFocusReturn(ref: React.RefObject<HTMLElement | null>): void {
  const [opener] = React.useState(activeElementOf);
  React.useEffect(() => {
    const container = ref.current;
    const target =
      container?.querySelector<HTMLElement>('textarea:not([disabled])') ??
      container?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
    return () => opener?.focus();
  }, [ref, opener]);
}

/**
 * Comportamiento de foco del panel (020b D-5, CA-19): el fondo `inert` mientras es hoja modal y el foco de vuelta a
 * quien lo abrió. El orden importa: al desmontar se quita el `inert` antes de devolver el foco.
 */
export function useAgentSheetFocus(
  ref: React.RefObject<HTMLElement | null>,
  isModal: boolean,
): void {
  useInertBackground(ref, isModal);
  useFocusReturn(ref);
}

/** Tab y Shift+Tab giran dentro de la hoja modal: del último control al primero y al revés. */
export function trapTabKey(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return;
  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) return;
  const edge = event.shiftKey ? first : last;
  if (document.activeElement !== edge) return;
  event.preventDefault();
  (event.shiftKey ? last : first).focus();
}
