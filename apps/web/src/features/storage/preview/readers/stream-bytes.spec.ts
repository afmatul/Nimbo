import { readStreamBytes } from './stream-bytes';

function body(chunks: readonly number[][], failAt?: number) {
  const cancel = jest.fn();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === failAt) controller.error(new Error('PRIVATE'));
      else if (index >= chunks.length) controller.close();
      else controller.enqueue(Uint8Array.from(chunks[index] ?? []));
      index++;
    },
    cancel,
  });
  return { stream, cancel };
}

describe('readStreamBytes: reunión de un body ya validado (PDF y ZIP)', () => {
  it('CA-1: concatena los chunks en orden y libera el stream', async () => {
    const { stream } = body([[1, 2], [], [3]]);
    expect([...(await readStreamBytes(stream))]).toEqual([1, 2, 3]);
    expect(stream.locked).toBe(false);
  });

  it('CA-1: body vacío produce un arreglo vacío', async () => {
    expect((await readStreamBytes(body([]).stream)).length).toBe(0);
  });

  it('CA-2: un error del stream se propaga y el reader queda liberado', async () => {
    const { stream } = body([[1]], 1);
    await expect(readStreamBytes(stream)).rejects.toThrow();
    expect(stream.locked).toBe(false);
  });
});
