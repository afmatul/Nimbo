import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

type EngineResult = {
  readonly ok: boolean;
  readonly native?: string;
  readonly preview?: unknown;
  readonly projection?: unknown;
  readonly requests?: readonly { readonly omit: boolean; readonly headers: readonly string[] }[];
};

describe('PPTX con entrada ESM real de zip.js y saxes (Node, no navegador)', () => {
  it.each([
    ['pptx', 'function'],
    ['pptx-strict', 'function'],
    ['pptx-fallback', 'undefined'],
  ])(
    'CA-1/11: %s proyecta grupos, tablas, campos cacheados e herencia sin plantilla',
    async (scenario, native) => {
      const { stdout } = await promisify(execFile)(process.execPath, [
        join(__dirname, 'testing/ooxml-engine-runner.mjs'),
        scenario,
      ]);
      const result = JSON.parse(stdout) as EngineResult;
      expect(result.ok).toBe(true);
      expect(result.native).toBe(native);
      expect(result.preview).toEqual({
        kind: 'pptx',
        slides: [
          { index: 0, state: 'visible' },
          { index: 1, state: 'hidden' },
        ],
      });
      expect(result.projection).toEqual({
        index: 0,
        blocks: [
          { kind: 'text', text: 'Master' },
          { kind: 'text', text: 'Layout' },
          { kind: 'text', text: 'Hola mundo\n42' },
          { kind: 'table', rows: [['A', 'B']] },
        ],
      });
      expect(result.requests?.length).toBeGreaterThan(0);
      expect(
        result.requests?.every(({ omit, headers }) => omit && headers.join() === 'range'),
      ).toBe(true);
    },
  );
});
