'use client';

import type { DownloadUrlResponse } from '@nimbo/contracts';
import * as React from 'react';

import { recordQuickAccessOpen, useRecordFileOpen } from './use-quick-access';
import { useUploads } from './use-upload-manager';

/**
 * Pide la URL de descarga de 005 (`attachment`) de un archivo; el visor de 017 la recibe sin ver el resto de storage.
 * Si la URL llega, el archivo cuenta como reciente en «Accesos rápidos» (006 CA-27, Q-3).
 */
export function useFileDownload(): (fileId: string) => Promise<DownloadUrlResponse> {
  const { api } = useUploads();
  return React.useCallback(
    async (fileId: string) => {
      const response = await api.downloadUrl(fileId);
      void recordQuickAccessOpen(api, { type: 'file', id: fileId });
      return response;
    },
    [api],
  );
}

/** El archivo que se abre en la vista previa o la ficha cuenta como reciente (006 CA-27); `null` aún no se registra. */
export function useRecordedFileOpen(fileId: string | null): void {
  const { api } = useUploads();
  useRecordFileOpen(api, fileId);
}
