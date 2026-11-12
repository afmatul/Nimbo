'use client';

import * as React from 'react';

/** El botón toma el foco al montarse si es al que debe volver (013c CA-15, R-2). */
export function useFocusOnMount(active: boolean): React.RefObject<HTMLButtonElement | null> {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (active) ref.current?.focus();
  }, [active]);
  return ref;
}
