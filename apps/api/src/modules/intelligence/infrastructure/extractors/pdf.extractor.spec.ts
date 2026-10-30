import { existsSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type {
  CommandLimits,
  CommandResult,
  ICommandRunner,
} from '../../application/ports/i-command-runner.port';
import { CommandLimitExceededError } from '../../application/ports/i-command-runner.port';
import type { Segment } from '../../domain/segment';

import { PdfExtractor } from './pdf.extractor';

const GHOSTSCRIPT = 'gs-de-prueba';
const PDF = Buffer.from('%PDF-1.7\n…contenido…\n%%EOF', 'latin1');
const OWNER_ONLY = 0o700;
const PERMISSION_BITS = 0o777;

/** `ICommandRunner` falso: escribe una salida por página como Ghostscript `txtwrite` y recuerda la llamada. */
class FakeGhostscript implements ICommandRunner {
  readonly calls: { command: string; args: readonly string[]; limits: CommandLimits }[] = [];
  workDir = '';
  workDirMode = 0;

  constructor(
    private readonly pages: readonly string[],
    private readonly exitCode = 0,
  ) {}

  run(command: string, args: readonly string[], limits: CommandLimits): Promise<CommandResult> {
    this.calls.push({ command, args, limits });
    const pattern = outputPattern(args);
    this.workDir = dirname(pattern);
    this.workDirMode = statSync(this.workDir).mode & PERMISSION_BITS;
    this.pages.forEach((text, index) => {
      writeFileSync(pattern.replace('%d', String(index + 1)), text, 'utf8');
    });
    return Promise.resolve({ exitCode: this.exitCode, stdout: Buffer.alloc(0) });
  }
}

function outputPattern(args: readonly string[]): string {
  const prefix = '-sOutputFile=';
  const arg = args.find((value) => value.startsWith(prefix)) ?? '';
  return arg.slice(prefix.length).replaceAll('%%', '%');
}

const cited = (segments: readonly Segment[]): [string, string][] =>
  segments.map((segment) => [segment.text, segment.location.label()]);

const extractorWith = (runner: ICommandRunner): PdfExtractor =>
  new PdfExtractor(runner, { bin: GHOSTSCRIPT });

describe('PdfExtractor', () => {
  it('lee `.pdf` (tipo `pdf`)', () => {
    expect(extractorWith(new FakeGhostscript([])).kind).toBe('pdf');
  });

  it('CA-2: una salida por página, en orden de página, cada una con su página; las vacías no se emiten', async () => {
    const pages = Array.from({ length: 11 }, (_v, index) => `texto de la página ${index + 1}`);
    pages[2] = '   \n\f';

    const segments = await extractorWith(new FakeGhostscript(pages)).extract(PDF);

    expect(cited(segments).map(([, label]) => label)).toEqual(
      [1, 2, 4, 5, 6, 7, 8, 9, 10, 11].map((page) => `Página ${page}`),
    );
    expect(segments[9]?.text).toBe('texto de la página 11');
  });

  it('CA-2: normaliza el relleno de maquetación de `txtwrite` sin unir páginas', async () => {
    const segments = await extractorWith(
      new FakeGhostscript(['﻿   Título     del\tinforme   \r\n\n  segunda línea  ']),
    ).extract(PDF);

    expect(cited(segments)).toEqual([['Título del informe\nsegunda línea', 'Página 1']]);
  });

  it('llama a Ghostscript con `txtwrite` en UTF-8, modo seguro y topes', async () => {
    const runner = new FakeGhostscript(['a']);

    await extractorWith(runner).extract(PDF);

    const [call] = runner.calls;
    expect(call?.command).toBe(GHOSTSCRIPT);
    expect(call?.args).toEqual(
      expect.arrayContaining(['-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=txtwrite']),
    );
    expect(call?.limits.timeoutMs).toBeGreaterThan(0);
    expect(call?.limits.maxOutputBytes).toBeGreaterThan(0);
  });

  it('CA-4: sin texto en ninguna página (escaneado) → `sin_texto`', async () => {
    await expect(
      extractorWith(new FakeGhostscript(['', ' \n ', '\f'])).extract(PDF),
    ).rejects.toMatchObject({ name: 'NotIndexableError', reason: 'sin_texto' });
  });

  it.each([
    ['Ghostscript no lo puede leer (ilegible o cifrado)', new FakeGhostscript(['a'], 1)],
    ['Ghostscript no produce ninguna página', new FakeGhostscript([])],
  ])('CA-5: %s → `formato_no_soportado`', async (_case, runner) => {
    await expect(extractorWith(runner).extract(PDF)).rejects.toMatchObject({
      name: 'NotIndexableError',
      reason: 'formato_no_soportado',
    });
  });

  it('CA-5: un contenido sin cabecera `%PDF-` no llega a Ghostscript → `formato_no_soportado`', async () => {
    const runner = new FakeGhostscript(['a']);

    await expect(
      extractorWith(runner).extract(Buffer.from('%!PS-Adobe-3.0\nshowpage', 'latin1')),
    ).rejects.toMatchObject({ reason: 'formato_no_soportado' });
    expect(runner.calls).toHaveLength(0);
  });

  it('trabaja en un directorio temporal propio (0700) y lo borra al terminar', async () => {
    const runner = new FakeGhostscript(['a']);

    await extractorWith(runner).extract(PDF);

    expect(runner.workDir).not.toBe('');
    expect(existsSync(runner.workDir)).toBe(false);
    // Windows no tiene bits de permiso POSIX; CI (Linux) comprueba el 0700.
    if (process.platform !== 'win32') expect(runner.workDirMode).toBe(OWNER_ONLY);
  });

  it('borra el directorio temporal también cuando falla, y un tope pasado sigue siendo transitorio', async () => {
    const runner = new FakeGhostscript([]);
    runner.run = (command, args, limits) => {
      FakeGhostscript.prototype.run.call(runner, command, args, limits);
      return Promise.reject(new CommandLimitExceededError('timeout'));
    };

    await expect(extractorWith(runner).extract(PDF)).rejects.toBeInstanceOf(
      CommandLimitExceededError,
    );
    expect(existsSync(runner.workDir)).toBe(false);
  });
});
