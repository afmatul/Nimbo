import { DOWNLOAD_URL_TTL_SECONDS } from '@nimbo/contracts';

import type { IClock } from '../../../shared';
import type { File } from '../domain/file';
import { ObjectKey } from '../domain/object-key';

import type { IObjectStorage } from './ports/i-object-storage.port';

const MS_PER_SECOND = 1000;

/** URL de descarga firmada y el instante en que deja de valer (005 CA-13). */
export interface DownloadUrl {
  readonly url: string;
  readonly expiresAt: Date;
}

/** Un solo objeto que se firma y el nombre sugerido de la descarga (sin la clave fuera de `storage`). */
export interface DownloadObject {
  readonly objectKey: string;
  readonly fileName: string;
}

/** La versión vigente de un archivo (005 CA-13, 013 CA-10): su clave y el nombre del archivo. */
export const currentVersionObject = (file: File): DownloadObject => ({
  objectKey: ObjectKey.of(file.ownerId, file.id, file.currentVersionId).value,
  fileName: file.name.value,
});

/**
 * Regla de seguridad de las descargas (RNF-06, 005 CA-13 y CA-14): URL de `DOWNLOAD_URL_TTL_SECONDS` (5 minutos) a un
 * solo objeto, con descarga forzada (la pone el adaptador). La usan `FileService` y `LinkedFileGateway` (plan 013 §2).
 */
export async function signDownload(
  objects: Pick<IObjectStorage, 'presignDownload'>,
  clock: IClock,
  object: DownloadObject,
): Promise<DownloadUrl> {
  const url = await objects.presignDownload({
    key: object.objectKey,
    fileName: object.fileName,
    expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
  });
  const expiresAt = new Date(clock.now().getTime() + DOWNLOAD_URL_TTL_SECONDS * MS_PER_SECOND);
  return { url, expiresAt };
}
