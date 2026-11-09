'use client';

import type { DownloadUrlResponse, FileVersionSummary } from '@nimbo/contracts';

import { usePreparingDownload } from '../../../lib/use-preparing-download';

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
  const { preparing, download } = usePreparingDownload(requestUrl, onFailure, openUrl);
  return {
    preparingId: preparing?.id ?? null,
    download: async (version) => {
      await download(version);
    },
  };
}
