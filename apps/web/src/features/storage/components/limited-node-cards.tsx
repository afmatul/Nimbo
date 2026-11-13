'use client';

import * as React from 'react';

import type { ListControls } from '../hooks/use-folder-contents';

import { LoadMore } from './load-more';
import { NodeCards, type NodeCardsProps } from './node-cards';

/** Tarjetas que se ven de entrada y cuántas suma cada «Mostrar más» (la vista de lista no tiene tope). */
export const CARDS_STEP = 24;

/** `limit`: tope de tarjetas visibles; `from`: cuántas se veían antes del último «Mostrar más» (para anunciarlo). */
interface CardRange {
  readonly limit: number;
  readonly from: number;
}

const INITIAL_RANGE: CardRange = { limit: CARDS_STEP, from: CARDS_STEP };

interface CardWindow {
  readonly shown: number;
  readonly added: number;
  readonly showMore: () => void;
}

/**
 * Ventana de tarjetas sobre lo ya cargado: «Mostrar más» descubre las siguientes y solo pide otra página (el mismo
 * `loadMore` de «Cargar más», 007) cuando ya se ve todo lo cargado.
 */
function useCardWindow(total: number, controls: ListControls | undefined): CardWindow {
  const [range, setRange] = React.useState(INITIAL_RANGE);
  const shown = Math.min(range.limit, total);
  const showMore = (): void => {
    if (shown >= total) controls?.loadMore();
    setRange({ from: shown, limit: shown + CARDS_STEP });
  };
  return { shown, added: Math.max(0, shown - Math.min(range.from, total)), showMore };
}

const ignore = (): void => undefined;

export interface LimitedNodeCardsProps extends NodeCardsProps {
  /** Paginación del listado; sin ella «Mostrar más» solo descubre lo ya cargado. */
  readonly controls: ListControls | undefined;
}

/** Las primeras `CARDS_STEP` tarjetas y «Mostrar más» debajo, con el patrón de «Cargar más» (estados, error, anuncio). */
export function LimitedNodeCards({ controls, ...cards }: LimitedNodeCardsProps): React.JSX.Element {
  const { shown, added, showMore } = useCardWindow(cards.nodes.length, controls);
  const hidden = cards.nodes.length - shown;
  return (
    <div className="flex flex-col gap-3">
      <NodeCards {...cards} nodes={cards.nodes.slice(0, shown)} />
      <LoadMore
        label="Mostrar más"
        status={controls?.more ?? 'idle'}
        hasMore={hidden > 0 || (controls?.hasMore ?? false)}
        added={added}
        placeName={cards.placeName}
        onLoadMore={showMore}
        onDismissError={controls?.dismissMoreError ?? ignore}
      />
    </div>
  );
}
