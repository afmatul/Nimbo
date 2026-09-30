import { type RefObject, useEffect, useRef } from 'react';

/**
 * Lleva el foco al título de un `StateView` al montar (003 §6.9, CA-17). `StateView` no expone `ref` del título, así
 * que se busca su encabezado dentro del contenedor.
 */
export function useFocusTitleOnMount(): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const title = containerRef.current?.querySelector('h3');
    if (!title) return;
    title.tabIndex = -1;
    title.focus();
  }, []);

  return containerRef;
}
