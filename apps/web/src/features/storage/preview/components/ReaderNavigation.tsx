'use client';

import * as React from 'react';

import { Button } from '../../../../components/ui/button';

export type UnitNavigationProps = {
  readonly label: string;
  readonly status: string;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
  readonly previous: () => void;
  readonly next: () => void;
  readonly previousLabel?: string;
  readonly nextLabel?: string;
};

/** Un control que se deshabilita con el foco lo perdería: el foco pasa al control opuesto. */
function useEdgeFocus(hasPrevious: boolean, hasNext: boolean) {
  const previousButton = React.useRef<HTMLButtonElement>(null);
  const nextButton = React.useRef<HTMLButtonElement>(null);
  React.useLayoutEffect(() => {
    const focused = document.activeElement;
    if (!hasNext && focused === nextButton.current) previousButton.current?.focus();
    if (!hasPrevious && focused === previousButton.current) nextButton.current?.focus();
  }, [hasPrevious, hasNext]);
  return { previousButton, nextButton };
}

/** Anterior/siguiente para páginas, ventanas de filas y diapositivas: botones reales y estado anunciado. */
export function UnitNavigation(props: UnitNavigationProps): React.JSX.Element {
  const { previousButton, nextButton } = useEdgeFocus(props.hasPrevious, props.hasNext);
  return (
    <nav aria-label={props.label} className="flex flex-wrap items-center justify-between gap-3">
      <Button
        ref={previousButton}
        type="button"
        variant="outline"
        disabled={!props.hasPrevious}
        onClick={props.previous}
      >
        {props.previousLabel ?? 'Anterior'}
      </Button>
      <p role="status" className="tabular-nums">
        {props.status}
      </p>
      <Button
        ref={nextButton}
        type="button"
        variant="outline"
        disabled={!props.hasNext}
        onClick={props.next}
      >
        {props.nextLabel ?? 'Siguiente'}
      </Button>
    </nav>
  );
}

/** Éxito del lector sin páginas, hojas ni diapositivas (CA-1); Descargar sigue en el encabezado. */
export function EmptyFileNotice(): React.JSX.Element {
  return <p role="status">Este archivo no tiene contenido para mostrar.</p>;
}
