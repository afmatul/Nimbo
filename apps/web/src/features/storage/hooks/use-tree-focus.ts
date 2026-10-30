'use client';

import * as React from 'react';

/** Foco itinerante del árbol: mover el foco re-renderiza y después enfoca el elemento. */
export function useTreeFocus(initial: string): {
  readonly focused: string;
  readonly focusItem: (key: string) => void;
  readonly itemRef: (key: string, element: HTMLLIElement | null) => void;
} {
  const [focused, setFocused] = React.useState(initial);
  const items = React.useRef(new Map<string, HTMLLIElement>());
  const pending = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (pending.current === null) return;
    items.current.get(pending.current)?.focus();
    pending.current = null;
  });

  const itemRef = React.useCallback((key: string, element: HTMLLIElement | null) => {
    if (element === null) items.current.delete(key);
    else items.current.set(key, element);
  }, []);

  const focusItem = React.useCallback((key: string) => {
    pending.current = key;
    setFocused(key);
  }, []);

  return { focused, focusItem, itemRef };
}
