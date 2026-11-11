import { partKey, type ZipPackage } from '../ooxml-package-reader';

import { SIGNED_URL } from './object-server';

export type HeldRange = {
  pending: number;
  readonly held: Promise<void>;
  signal: AbortSignal | null | undefined;
  fail: (reason: unknown) => void;
};

function rangeResponse(
  state: HeldRange,
  signal: AbortSignal | null | undefined,
): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const onAbort = (): void => state.fail(new DOMException('Cancelado', 'AbortError'));
    state.fail = (reason) => {
      if (state.pending === 0) return;
      state.pending--;
      signal?.removeEventListener('abort', onAbort);
      reject(reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function holdNextRange(): HeldRange {
  let enter = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const state: HeldRange = { pending: 0, held, signal: undefined, fail: () => undefined };
  jest.spyOn(globalThis, 'fetch').mockImplementationOnce((input, init) => {
    expect(input).toBe(SIGNED_URL);
    expect(init?.credentials).toBe('omit');
    state.signal = init?.signal;
    state.pending++;
    enter();
    return rangeResponse(state, init?.signal);
  });
  return state;
}

export function holdPart(pkg: ZipPackage, part: string): Promise<ReturnType<typeof holdNextRange>> {
  const readPart = pkg.readPart;
  let armed = true;
  return new Promise((resolve) => {
    jest.spyOn(pkg, 'readPart').mockImplementation((...args) => {
      if (armed && partKey(args[0]) === partKey(part)) {
        armed = false;
        resolve(holdNextRange());
      }
      return readPart(...args);
    });
  });
}
