import * as React from 'react';
import { flushSync } from 'react-dom';

export interface MobileNav {
  readonly open: boolean;
  readonly toggle: () => void;
  /** Cierra el cajón y devuelve el foco al botón que lo abre. */
  readonly close: () => void;
  readonly menuButtonRef: React.RefObject<HTMLButtonElement | null>;
}

/** Estado del cajón de navegación móvil y del botón que lo abre. */
export function useMobileNav(initialOpen: boolean): MobileNav {
  const [open, setOpen] = React.useState(initialOpen);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const toggle = React.useCallback(() => setOpen((current) => !current), []);
  const close = React.useCallback(() => {
    // El encabezado lleva `inert` mientras el cajón está abierto: se quita antes de devolver el foco al botón.
    flushSync(() => setOpen(false));
    menuButtonRef.current?.focus();
  }, []);
  return { open, toggle, close, menuButtonRef };
}
