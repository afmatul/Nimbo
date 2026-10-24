import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import {
  I_COMMAND_RUNNER,
  type CommandLimits,
  type ICommandRunner,
} from '../../application/ports/i-command-runner.port';
import type { ITextExtractor } from '../../application/ports/i-text-extractor.port';
import { NotIndexableError } from '../../domain/errors';
import { PdfLocation } from '../../domain/pdf-location';
import type { Segment } from '../../domain/segment';

/** Binario de Ghostscript (`GHOSTSCRIPT_BIN`: `gs`; en Windows, `gswin64c` o su ruta). Solo lo lee el `worker`. */
export interface GhostscriptConfig {
  readonly bin: string;
}

export const GHOSTSCRIPT_CONFIG = Symbol('GhostscriptConfig');

/**
 * Un PDF de 50 páginas se lee en segundos; el tope evita que un archivo hostil retenga el `worker` (concurrencia 1) y
 * deja margen dentro de los 60 s de CA-11. Con `-q`, Ghostscript casi no escribe en la salida estándar.
 */
const GHOSTSCRIPT_LIMITS: CommandLimits = { timeoutMs: 45_000, maxOutputBytes: 64 * 1024 };
const SUCCESS_EXIT_CODE = 0;
/** Todo PDF empieza con esta firma en su primer kilobyte; sin ella el contenido no llega a Ghostscript (CA-5). */
const PDF_SIGNATURE = Buffer.from('%PDF-', 'latin1');
const SIGNATURE_WINDOW_BYTES = 1024;
const TEMP_PREFIX = 'nimbo-pdf-';
const INPUT_FILE = 'input.pdf';
/** La copia del PDF solo la lee el proceso del `worker` (el directorio ya es 0700). */
const OWNER_READ_WRITE = 0o600;
/** `txtwrite` escribe un archivo por página con `%d` = número de página desde 1. */
const PAGE_FILE_PATTERN = 'page-%d.txt';
const PAGE_FILE = /^page-(\d+)\.txt$/;
const BOM = /^﻿/;
const LINE_BREAK = /\r\n|\r|\n|\f/;
const LAYOUT_SPACES = /[ \t ]+/g;

interface PageFile {
  readonly page: number;
  readonly name: string;
}

/** Argumentos de `txtwrite` en UTF-8 (`TextFormat=3`) y modo seguro; `%` del directorio se escapa para Ghostscript. */
function ghostscriptArgs(input: string, workDir: string): readonly string[] {
  const output = join(workDir.replaceAll('%', '%%'), PAGE_FILE_PATTERN);
  return [
    '-q',
    '-dSAFER',
    '-dBATCH',
    '-dNOPAUSE',
    '-sDEVICE=txtwrite',
    '-dTextFormat=3',
    `-sOutputFile=${output}`,
    input,
  ];
}

/** Quita el relleno de maquetación de `txtwrite`: espacios repetidos y líneas en blanco. No une páginas. */
function normalizePage(raw: string): string {
  return raw
    .replace(BOM, '')
    .split(LINE_BREAK)
    .map((line) => line.replace(LAYOUT_SPACES, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

async function listPages(workDir: string): Promise<readonly PageFile[]> {
  const names = await readdir(workDir);
  return names
    .flatMap((name) => {
      const match = PAGE_FILE.exec(name);
      return match ? [{ page: Number(match[1]), name }] : [];
    })
    .sort((a, b) => a.page - b.page);
}

async function readSegments(workDir: string, pages: readonly PageFile[]): Promise<Segment[]> {
  const segments: Segment[] = [];
  for (const { page, name } of pages) {
    const text = normalizePage(await readFile(join(workDir, name), 'utf8'));
    if (text.length > 0) segments.push({ text, location: PdfLocation.page(page) });
  }
  return segments;
}

function requirePdfSignature(content: Buffer): void {
  if (!content.subarray(0, SIGNATURE_WINDOW_BYTES).includes(PDF_SIGNATURE)) {
    throw new NotIndexableError('formato_no_soportado');
  }
}

/**
 * Extractor de `.pdf` (CA-2, CA-4, CA-5; D-1, ADR-0033 b): Ghostscript `txtwrite` en un proceso aparte, con tiempo
 * límite y sin shell, dentro de un directorio temporal propio (0700) que se borra siempre. Un segmento por página con
 * texto. Si Ghostscript no lo lee o no da páginas → `formato_no_soportado`; si ninguna página tiene texto (escaneado,
 * sin OCR) → `sin_texto`. Un tope pasado o un binario ausente se propagan como transitorios.
 */
@Injectable()
export class PdfExtractor implements ITextExtractor {
  readonly kind = 'pdf';

  constructor(
    @Inject(I_COMMAND_RUNNER) private readonly runner: ICommandRunner,
    @Inject(GHOSTSCRIPT_CONFIG) private readonly config: GhostscriptConfig,
  ) {}

  async extract(content: Buffer): Promise<readonly Segment[]> {
    requirePdfSignature(content);
    const workDir = await mkdtemp(join(tmpdir(), TEMP_PREFIX));
    try {
      return await this.extractIn(workDir, content);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private async extractIn(workDir: string, content: Buffer): Promise<readonly Segment[]> {
    const input = join(workDir, INPUT_FILE);
    await writeFile(input, content, { mode: OWNER_READ_WRITE });
    const result = await this.runner.run(
      this.config.bin,
      ghostscriptArgs(input, workDir),
      GHOSTSCRIPT_LIMITS,
    );
    const pages = await listPages(workDir);
    if (result.exitCode !== SUCCESS_EXIT_CODE || pages.length === 0) {
      throw new NotIndexableError('formato_no_soportado');
    }
    const segments = await readSegments(workDir, pages);
    if (segments.length === 0) throw new NotIndexableError('sin_texto');
    return segments;
  }
}
