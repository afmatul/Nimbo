export function concatenateChunks(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Libera el reader; cancelar uno fallido puede devolver la excepción privada del transporte, que se descarta. */
export async function releaseStreamReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  cancel: boolean,
): Promise<void> {
  try {
    if (cancel) await reader.cancel();
  } catch {
    // Nunca transportar el error privado del body al estado público.
  } finally {
    reader.releaseLock();
  }
}

/** Descarta un body que llegó cuando su intento ya no existe: la entrega y su eventual error se ignoran. */
export async function discardStream(body: ReadableStream<Uint8Array>): Promise<void> {
  try {
    await body.cancel();
  } catch {
    // El intento ya no existe.
  }
}

/**
 * Reúne un body ya validado por `fetchObjectBytes`; no repite ninguna política HTTP del helper.
 * Lo comparten los rangos de PDF y de ZIP: siempre cancela y libera el reader, también tras un error.
 */
export async function readStreamBytes(
  body: ReadableStream<Uint8Array>,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value);
    }
    return concatenateChunks(chunks);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    chunks.length = 0;
  }
}
