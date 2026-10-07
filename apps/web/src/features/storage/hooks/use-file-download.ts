'use client';

import type { DownloadUrlResponse } from '@nimbo/contracts';
import * as React from 'react';

import { useUploads } from './use-upload-manager';

/** Pide la URL de descarga de 005 (`attachment`) de un archivo; el visor de 017 la recibe sin ver el resto de storage. */
export function useFileDownload(): (fileId: string) => Promise<DownloadUrlResponse> {
  const { api } = useUploads();
  return React.useCallback((fileId: string) => api.downloadUrl(fileId), [api]);
}
