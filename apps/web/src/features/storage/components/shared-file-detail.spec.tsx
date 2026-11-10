/**
 * @jest-environment jsdom
 */
import type { DownloadUrlResponse, FileDetailResponse } from '@nimbo/contracts';
import { act, render, screen } from '@testing-library/react';

import { SharedFileDetail } from './shared-file-detail';

const DETAIL: FileDetailResponse = {
  file: {
    id: 'f-1',
    name: 'Informe_trimestral_Q3.docx',
    sizeBytes: 2_600_000,
    kind: 'docx',
    folderId: null,
    createdAt: '2026-10-08T16:42:00.000Z',
    updatedAt: '2026-10-08T16:42:00.000Z',
  },
  accessLevel: 'VIEWER',
};
const SIGNED: DownloadUrlResponse = {
  url: 'https://objetos.local/firmada',
  expiresAt: '2026-10-08T16:47:00.000Z',
};

describe('SharedFileDetail (012b CA-9, 013b CA-3)', () => {
  it('013b CA-3: doble clic en «Descargar» antes de 2 s: una sola petición', async () => {
    let resolve!: (value: DownloadUrlResponse) => void;
    const downloadUrl = jest.fn(() => new Promise<DownloadUrlResponse>((res) => (resolve = res)));
    const openUrl = jest.fn();
    render(<SharedFileDetail detail={DETAIL} api={{ downloadUrl }} openUrl={openUrl} />);

    const button = screen.getByRole('button', { name: 'Descargar' });
    await act(async () => {
      button.click();
      button.click();
    });

    expect(downloadUrl).toHaveBeenCalledTimes(1);
    await act(async () => resolve(SIGNED));
    expect(openUrl).toHaveBeenCalledTimes(1);
    expect(openUrl).toHaveBeenCalledWith(SIGNED.url);
  });
});
