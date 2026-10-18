import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
type RealResult = {
  readonly ok: boolean;
  readonly reason?: string;
  readonly pages: Array<{ number: number; width: number; rendered: boolean; text?: string }>;
  readonly scriptExecuted: boolean;
  readonly containsJavaScript: boolean;
  readonly firstPageBytes: number;
  readonly totalLength: number;
  readonly retry?: { previousDestroyed: boolean; sameUrl: boolean; bootstraps: number };
  readonly cleanup: {
    taskDestroyed: boolean;
    signalsAborted: boolean;
    canvasReleased: boolean;
    runtimeDisposals: number;
  };
};
async function inspectPdf(kind: string): Promise<RealResult> {
  const stdout = await execute(process.execPath, [
    join(__dirname, 'testing/pdf-engine-runner.mjs'),
    kind,
  ]).then(
    (result) => result.stdout,
    (error: { stdout: string }) => error.stdout,
  );
  return JSON.parse(stdout) as RealResult;
}

describe('PDF.js real + canvas nativo + object-bytes real (red controlada)', () => {
  it('CA-1/11: PDF válido carga, expone página 1 y completa render real por rangos', async () => {
    const { stdout } = await execute(process.execPath, [
      join(__dirname, 'testing/pdf-engine-runner.mjs'),
      'normal',
    ]);
    const result = JSON.parse(stdout) as {
      ok: boolean;
      pages: object[];
      requests: Array<{ start: number; end: number; omit: boolean; headers: string[] }>;
    };
    expect(result.ok).toBe(true);
    expect(result.pages).toEqual([{ number: 1, width: 200, rendered: true, text: 'Pagina 1' }]);
    expect(result.requests[0]).toEqual({ start: 0, end: 0, omit: true, headers: ['range'] });
    expect(result.requests.length).toBeGreaterThan(1);
    expect(
      result.requests.every((request) => request.omit && request.headers.join() === 'range'),
    ).toBe(true);
  });
  it('CA-1: multipágina real conserva texto y permite representar las tres páginas', async () => {
    const result = await inspectPdf('multi');
    expect(result.ok).toBe(true);
    expect(result.pages.map((page) => page.number)).toEqual([1, 2, 3]);
    expect(result.pages.map((page) => page.text)).toEqual(['Pagina 1', 'Pagina 2', 'Pagina 3']);
    expect(result.pages.every((page) => page.rendered)).toBe(true);
    expect(result.firstPageBytes).toBeLessThan(result.totalLength);
    expect(result.cleanup).toEqual({
      taskDestroyed: true,
      signalsAborted: true,
      canvasReleased: true,
      runtimeDisposals: 1,
    });
  });

  it('CA-1: PDF escaneado real representa imagen sin inventar texto ni exigir OCR', async () => {
    const result = await inspectPdf('scan');
    expect(result.ok).toBe(true);
    expect(result.pages[0]?.rendered).toBe(true);
    expect(result.pages[0]?.text).toBe('');
  });

  it.each([
    ['protected', 'protected'],
    ['corrupt', 'corrupt'],
    ['transport', 'unavailable'],
    ['rangeFailure', 'unavailable'],
  ])('CA-2: PDF real %s produce solo la razón cerrada %s', async (kind, reason) => {
    const result = await inspectPdf(kind);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(reason);
  });

  it('CA-1: fixture tiene JavaScript detectable por parser real, pero render no lo ejecuta', async () => {
    const result = await inspectPdf('script');
    expect(result.ok).toBe(true);
    expect(result.containsJavaScript).toBe(true);
    expect(result.scriptExecuted).toBe(false);
    expect(result.pages[0]?.rendered).toBe(true);
  });

  it('CA-2/11: retry real misma URL destruye A y crea otro bootstrap/GET para B', async () => {
    const result = await inspectPdf('retry');
    expect(result.ok).toBe(true);
    expect(result.retry).toEqual({ previousDestroyed: true, sameUrl: true, bootstraps: 2 });
    expect(result.cleanup).toEqual({
      taskDestroyed: true,
      signalsAborted: true,
      canvasReleased: true,
      runtimeDisposals: 2,
    });
  });
});
