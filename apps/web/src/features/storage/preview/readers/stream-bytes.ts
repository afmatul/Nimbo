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
    const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    chunks.length = 0;
  }
}
