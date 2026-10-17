'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Lleva el foco al elemento al aparecer un estado nuevo de la pantalla (teclado y lector de pantalla). */
export function useFocusOnMount<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}
