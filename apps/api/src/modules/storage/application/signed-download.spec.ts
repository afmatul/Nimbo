import { DOWNLOAD_URL_TTL_SECONDS } from '@nimbo/contracts';

import { FixedClock } from '../../../shared';

import type { IObjectStorage, PresignDownloadInput } from './ports/i-object-storage.port';
import { signDownload } from './signed-download';

const NOW = new Date('2026-10-06T10:00:00.000Z');

describe('signDownload', () => {
  it('005 CA-13: firma un objeto con la vigencia de descarga y devuelve su vencimiento', async () => {
    const presigned: PresignDownloadInput[] = [];
    const objects = {
      presignDownload: (input: PresignDownloadInput) => {
        presigned.push(input);
        return Promise.resolve('https://s3.test/obj');
      },
    } as unknown as IObjectStorage;

    const signed = await signDownload(objects, new FixedClock(NOW), {
      key: 'u/f/v',
      fileName: 'a.pdf',
    });

    expect(presigned).toEqual([
      { key: 'u/f/v', fileName: 'a.pdf', expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS },
    ]);
    expect(signed).toEqual({
      url: 'https://s3.test/obj',
      expiresAt: new Date(NOW.getTime() + DOWNLOAD_URL_TTL_SECONDS * 1000),
    });
  });
});
