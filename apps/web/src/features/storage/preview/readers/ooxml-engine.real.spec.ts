import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

type EngineResult = {
  readonly ok: boolean;
  readonly reason?: string;
  readonly mainPart?: string;
  readonly texts?: number;
  readonly native?: string;
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

  it('CA-2: CRC alterado en la entrada ESM real produce solo la razón cerrada corrupt', async () => {
    expect(await run('crc')).toEqual({ ok: false, reason: 'corrupt' });
  });
});
