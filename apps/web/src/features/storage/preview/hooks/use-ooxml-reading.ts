'use client';

import * as React from 'react';

import { readerFailure } from '../preview-failure';
import type { ReaderProps } from '../reader-events';
import type { OoxmlFailureReason } from '../readers/ooxml-package-reader';
import type { OoxmlWorkerOptions, OoxmlWorkerReading } from '../readers/ooxml-worker-client';
import type { PresentationPreview, SlideProjection } from '../readers/pptx-model';
import type { WorkbookPreview } from '../readers/xlsx-reader';
import type { SheetProjection } from '../readers/xlsx-sheet';

import { useLatestCallbacks } from './use-latest-callbacks';

type OoxmlModels = {
  readonly xlsx: { readonly preview: WorkbookPreview; readonly unit: SheetProjection };
  readonly pptx: { readonly preview: PresentationPreview; readonly unit: SlideProjection };
};
export type OoxmlFormat = keyof OoxmlModels;
type Preview<K extends OoxmlFormat> = OoxmlModels[K]['preview'];
type Unit<K extends OoxmlFormat> = OoxmlModels[K]['unit'];
export type UnitSelection = { readonly index: number; readonly offset: number };
export type OoxmlReaderProps = ReaderProps;
export type OoxmlReading<K extends OoxmlFormat> = {
  readonly preview: Preview<K> | null;
  readonly selection: UnitSelection;
  /** Unidad de la selección vigente; `null` mientras se lee: nunca se muestra una ventana anterior. */
  readonly unit: Unit<K> | null;
  /** Última unidad recibida, solo para conservar los controles mientras llega la siguiente. */
  readonly lastUnit: Unit<K> | null;
  readonly select: (selection: UnitSelection) => void;
};

type View<K extends OoxmlFormat> = Omit<OoxmlReading<K>, 'unit' | 'select'> & {
  readonly loading: boolean;
};
type Attempt = {
  readonly controller: AbortController;
  active: boolean;
  reading?: OoxmlWorkerReading;
};
type Events<K extends OoxmlFormat> = {
  readonly opened: (preview: Preview<K>) => void;
  readonly unit: (unit: Unit<K>) => void;
  readonly fail: (reason: OoxmlFailureReason) => void;
};
type Callbacks = React.RefObject<{
  readonly onFailure: OoxmlReaderProps['onFailure'];
  readonly onReady: OoxmlReaderProps['onReady'] | undefined;
}>;

const FIRST: UnitSelection = { index: 0, offset: 0 };

function initialView<K extends OoxmlFormat>(): View<K> {
  return { preview: null, selection: FIRST, lastUnit: null, loading: true };
}

function unitCount(preview: WorkbookPreview | PresentationPreview): number {
  return preview.kind === 'xlsx' ? preview.sheets.length : preview.slides.length;
}

/** Abortar basta para que el cliente termine el worker; `dispose` es idempotente. */
function disposeAttempt(attempt: Attempt): Promise<void> {
  attempt.active = false;
  attempt.controller.abort();
  attempt.reading?.dispose();
  return Promise.resolve();
}

function eventsOf<K extends OoxmlFormat>(
  attempt: Attempt,
  setView: React.Dispatch<React.SetStateAction<View<K>>>,
  callbacks: Callbacks,
): Events<K> {
  return {
    opened: (preview) => {
      if (!attempt.active) return;
      setView({ preview, selection: FIRST, lastUnit: null, loading: true });
      if (unitCount(preview) === 0) callbacks.current.onReady?.();
      else attempt.reading?.select(FIRST.index, FIRST.offset);
    },
    unit: (unit) => {
      if (!attempt.active) return;
      setView((view) => ({ ...view, lastUnit: unit, loading: false }));
      callbacks.current.onReady?.();
    },
    fail: (reason) => {
      if (!attempt.active) return;
      void disposeAttempt(attempt);
      setView(initialView<K>());
      callbacks.current.onFailure(readerFailure(reason));
    },
  };
}

async function startReading<K extends OoxmlFormat>(
  source: { readonly kind: K; readonly url: string },
  attempt: Attempt,
  events: Events<K>,
): Promise<void> {
  try {
    const { startOoxmlWorker } = await import('../readers/ooxml-runtime');
    if (!attempt.active) return;
    // El cliente ya rechaza metadata o proyecciones de otro formato (ooxml-worker-client).
    const options = {
      ...source,
      signal: attempt.controller.signal,
      onOpened: events.opened,
      onUnit: events.unit,
      onFailure: events.fail,
    } as OoxmlWorkerOptions;
    attempt.reading = startOoxmlWorker(options);
  } catch {
    events.fail('unavailable');
  }
}

function useReadingAttempt<K extends OoxmlFormat>(
  kind: K,
  props: OoxmlReaderProps,
  setView: React.Dispatch<React.SetStateAction<View<K>>>,
): React.RefObject<Attempt | null> {
  const { url, onFailure, onReady, registerCleanup } = props;
  const current = React.useRef<Attempt | null>(null);
  const callbacks = useLatestCallbacks({ onFailure, onReady });
  React.useEffect(() => {
    const attempt: Attempt = { controller: new AbortController(), active: true };
    current.current = attempt;
    const unregister = registerCleanup?.(() => disposeAttempt(attempt));
    void startReading({ kind, url }, attempt, eventsOf(attempt, setView, callbacks));
    return () => {
      unregister?.();
      void disposeAttempt(attempt);
    };
  }, [kind, url, registerCleanup, setView, callbacks]);
  return current;
}

/** Un solo worker por lectura: el cliente descarta respuestas obsoletas y la UI solo pinta la vigente. */
export function useOoxmlReading<K extends OoxmlFormat>(
  kind: K,
  props: OoxmlReaderProps,
): OoxmlReading<K> {
  const [view, setView] = React.useState<View<K>>(initialView<K>);
  const current = useReadingAttempt(kind, props, setView);
  const select = React.useCallback(
    (selection: UnitSelection) => {
      const attempt = current.current;
      if (!attempt?.active || attempt.reading === undefined) return;
      setView((value) => ({ ...value, selection, loading: true }));
      attempt.reading.select(selection.index, selection.offset);
    },
    [current],
  );
  const { preview, selection, lastUnit, loading } = view;
  return { preview, selection, lastUnit, unit: loading ? null : lastUnit, select };
}
