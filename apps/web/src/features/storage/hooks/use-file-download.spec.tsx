/**
 * @jest-environment jsdom
 */
import type { DownloadUrlResponse } from '@nimbo/contracts';
import { renderHook } from '@testing-library/react';
import type * as React from 'react';

import type { StorageApi } from '../api';
import { UploadsProvider } from '../components/uploads-provider';

import { useFileDownload } from './use-file-download';

const SIGNED: DownloadUrlResponse = {
  url: 'https://objetos.local/firmada',
  expiresAt: '2026-10-06T10:05:00.000Z',
};

describe('useFileDownload (017 CA-8)', () => {
  it('CA-8: pide la URL de descarga de 005 del archivo con la API de la pestaña', async () => {
    const downloadUrl = jest.fn(() => Promise.resolve(SIGNED));
    const api = { downloadUrl } as unknown as StorageApi;
    const wrapper = ({ children }: { readonly children: React.ReactNode }): React.JSX.Element => (
      <UploadsProvider api={api}>{children}</UploadsProvider>
    );

    const { result } = renderHook(() => useFileDownload(), { wrapper });

    await expect(result.current('f-1')).resolves.toEqual(SIGNED);
    expect(downloadUrl).toHaveBeenCalledWith('f-1');
  });
});
