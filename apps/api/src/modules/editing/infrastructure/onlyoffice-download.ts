import { Readable, Transform } from 'node:stream';
import type { TransformCallback } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

import { EditorDownloadRejectedError } from '../application/ports/i-document-editor.port';
import type { DownloadedDocument } from '../application/ports/i-document-editor.port';

const FIRST_REDIRECT_STATUS = 300;
const FIRST_CLIENT_ERROR_STATUS = 400;

/** Orígenes desde los que se acepta descargar: los del servidor de documentos (plan §4). */
export const trustedOriginsOf = (urls: readonly string[]): ReadonlySet<string> =>
  new Set(urls.map((url) => new URL(url).origin));

/** `true` si `url` es una URL cuyo origen (esquema, host y puerto) está en la lista; nunca por prefijo. */
export const isTrustedUrl = (url: string, origins: ReadonlySet<string>): boolean => {
  try {
    return origins.has(new URL(url).origin);
  } catch {
    return false;
  }
};

const isRedirect = (status: number): boolean =>
  status >= FIRST_REDIRECT_STATUS && status < FIRST_CLIENT_ERROR_STATUS;

const declaredLengthOf = (response: Response): bigint | null => {
  const header = response.headers.get('content-length');
  return header !== null && /^\d+$/.test(header) ? BigInt(header) : null;
};

/** Corta el flujo con error si trae más bytes de los declarados (CA-14: entrega que no es la anunciada). */
const capAt = (limit: bigint): Transform => {
  let received = 0n;
  return new Transform({
    transform(chunk: Buffer, _encoding, done: TransformCallback) {
      received += BigInt(chunk.length);
      if (received > limit) {
        done(new EditorDownloadRejectedError('too_large'));
        return;
      }
      done(null, chunk);
    },
  });
};

/**
 * El documento de una respuesta ya pedida sin seguir redirecciones: rechaza la redirección y lo que no declara su
 * tamaño o lo declara por encima de `maxBytes`; un estado de error es transitorio (se reintenta).
 */
export const documentOf = (response: Response, maxBytes: bigint): DownloadedDocument => {
  if (isRedirect(response.status)) throw new EditorDownloadRejectedError('redirect');
  if (!response.ok || response.body === null) {
    throw new Error(`El servidor de documentos respondió ${String(response.status)}.`);
  }
  const sizeBytes = declaredLengthOf(response);
  if (sizeBytes === null) throw new EditorDownloadRejectedError('no_length');
  if (sizeBytes > maxBytes) throw new EditorDownloadRejectedError('too_large');
  const body = Readable.fromWeb(response.body as WebReadableStream<Uint8Array>);
  return { content: body.pipe(capAt(sizeBytes)), sizeBytes };
};
