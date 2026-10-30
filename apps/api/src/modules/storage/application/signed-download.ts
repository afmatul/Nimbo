import { DOWNLOAD_URL_TTL_SECONDS } from '@nimbo/contracts';

import type { IClock } from '../../../shared';

import type { IObjectStorage } from './ports/i-object-storage.port';

const MS_PER_SECOND = 1000;

/** URL firmada y el instante en que deja de valer. */
export interface SignedFileUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

/** Política de 005 (un objeto, 300 s, `attachment`): única para la descarga y la vista previa (Art. VI.3). */
export async function signDownload(
  objects: IObjectStorage,
  clock: IClock,
  target: { readonly key: string; readonly fileName: string },
): Promise<SignedFileUrl> {
  const url = await objects.presignDownload({
    ...target,
    expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
  });
  const expiresAt = new Date(clock.now().getTime() + DOWNLOAD_URL_TTL_SECONDS * MS_PER_SECOND);
  return { url, expiresAt };
}
