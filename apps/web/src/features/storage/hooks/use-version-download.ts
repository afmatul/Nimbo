'use client';

import type { DownloadUrlResponse, FileVersionSummary } from '@nimbo/contracts';
import * as React from 'react';

import { PREPARING_DELAY_MS } from '../components/file-row-menu';

export interface VersionDownload {
  /** Versión cuya URL tarda más de 2 s: su botón dice «Preparando…» (RNF-14). */
  readonly preparingId: string | null;
  readonly download: (version: FileVersionSummary) => Promise<void>;
}

/**
 * Descarga de una versión (014 CA-8) con el patrón de 005: una petición a la vez, «Preparando…» pasados 2 s y la URL
 * firmada abierta en la pestaña. Si falla, `onFailure` decide el aviso y recibe cómo reintentar.
 */
export function useVersionDownload(
  requestUrl: (version: FileVersionSummary) => Promise<DownloadUrlResponse>,
  openUrl: (url: string) => void,
  onFailure: (version: FileVersionSummary, error: unknown, retry: () => void) => void,
): VersionDownload {
  const [preparingId, setPreparingId] = React.useState<string | null>(null);
  const inFlight = React.useRef(false);
  const preparingTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(preparingTimer.current), []);

  const download = async (version: FileVersionSummary): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    preparingTimer.current = setTimeout(() => setPreparingId(version.id), PREPARING_DELAY_MS);
    try {
      openUrl((await requestUrl(version)).url);
    } catch (error) {
      onFailure(version, error, () => void download(version));
    } finally {
      clearTimeout(preparingTimer.current);
      inFlight.current = false;
      setPreparingId(null);
    }
  };

  return { preparingId, download };
}
