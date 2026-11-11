import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

type EngineResult = {
  readonly ok: boolean;
  readonly reason?: string;
  readonly mainPart?: string;
  readonly texts?: number;
  readonly native?: string;
  readonly missingApi?: string;
  readonly preview?: unknown;
  readonly projection?: unknown;
  readonly size?: number;
  readonly requests?: ReadonlyArray<{
    start: number;
    end: number;
    omit: boolean;
    headers: string[];
  }>;
};

async function run(scenario: string): Promise<EngineResult> {
  const stdout = await promisify(execFile)(process.execPath, [
    join(__dirname, 'testing/ooxml-engine-runner.mjs'),
    scenario,
  ]).then(
    (result) => result.stdout,
    (error: { stdout: string }) => error.stdout,
  );
  return JSON.parse(stdout) as EngineResult;
}

describe('zip.js ESM publicado + saxes reales en Node (no navegador)', () => {
  it.each([
    ['valid', 'function'],
    ['fallback', 'undefined'],
  ])(
    'CA-1/11: %s abre el PPTX real, lee la parte en streaming y solo pide rangos sin credenciales',
    async (scenario, native) => {
      const result = await run(scenario);
      expect(result).toMatchObject({ ok: true, mainPart: '/ppt/presentation.xml', texts: 4000 });
      expect(result.native).toBe(native);
      expect(result.requests?.[0]).toEqual({ start: 0, end: 0, omit: true, headers: ['range'] });
      expect(
        result.requests?.every(({ omit, headers }) => omit && headers.join() === 'range'),
      ).toBe(true);
    },
  );

  it.each([
    ['xlsx', 'function'],
    ['xlsx-strict', 'function'],
    ['xlsx-fallback', 'undefined'],
    ['xlsx-no-from-entries', 'function'],
    ['xlsx-no-flat-map', 'function'],
  ])(
    'CA-1/11: %s proyecta valores guardados con zip.js ESM y saxes reales',
    async (scenario, native) => {
      const result = await run(scenario);
      expect(result.ok).toBe(true);
      expect(result.native).toBe(native);
      if (scenario === 'xlsx-no-from-entries') expect(result.missingApi).toBe('Object.fromEntries');
      if (scenario === 'xlsx-no-flat-map')
        expect(result.missingApi).toBe('Array.prototype.flatMap');
      expect(result.preview).toEqual({
        kind: 'xlsx',
        sheets: [
          { name: 'Cronograma', type: 'worksheet', state: 'visible' },
          { name: 'Gráfico', type: 'chartsheet', state: 'visible' },
        ],
      });
      expect(result.projection).toEqual({
        index: 0,
        columns: 3,
        rows: [
          {
            row: 1,
            cells: [
              { column: 1, text: 'Fase 0', type: 'text' },
              { column: 2, text: '28/08/2026', type: 'date' },
              { column: 3, text: 'Sin valor guardado', type: 'no-cache' },
            ],
          },
          { row: 2, cells: [{ column: 1, text: '999999999999999', type: 'number' }] },
        ],
        missingCache: 1,
      });
      expect(
        result.requests?.every(({ omit, headers }) => omit && headers.join() === 'range'),
      ).toBe(true);
    },
  );

  it('CA-2: CRC alterado en la entrada ESM real produce solo la razón cerrada corrupt', async () => {
    expect(await run('crc')).toEqual({ ok: false, reason: 'corrupt' });
  });
});
