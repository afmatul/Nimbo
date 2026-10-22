import { randomUUID } from 'node:crypto';

import { INDEXING_JOB } from '../../../src/modules/intelligence/infrastructure/bullmq-index.queue';
import { buildDocx, buildZip, PACKAGE_CONTENT_TYPES } from '../../support/docx-fixture';
import { itWithGhostscript } from '../../support/ghostscript';
import { pdfFixture } from '../../support/pdf-fixture';
import { buildPptx } from '../../support/pptx-fixture';
import { buildXlsx } from '../../support/xlsx-fixture';
import { settle } from '../realtime/realtime-test-app';
import { waitForLog } from '../setup/wait-for-log';
import type { StorageClient } from '../storage/storage-http';

import { createIndexingWorld, eventually, TEST_MAX_FILE_BYTES } from './indexing-world';
import type { IndexingWorld, UploadedFile } from './indexing-world';

const PDF_PAGES = 50;
/** Latencia simulada del proveedor para el PDF de 50 páginas (un lote, como `batchEmbedContents` con ≤ 100 textos). */
const PDF_EMBEDDING_LATENCY_MS = 3_000;
/** CA-11: un PDF de 50 páginas queda indexado en menos de un minuto. */
const PDF_MAX_DURATION_MS = 60_000;
const OVER_MAX_CHUNKS_SECTIONS = 5_001;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_BODY_BYTES = 2048;

const txt = (text: string): Buffer => Buffer.from(text, 'utf8');
const uniqueName = (base: string): string => `${randomUUID()}-${base}`;

/**
 * Pipeline de indexación de punta a punta (019 T-06 y T-12): la carga por el `api` programa el trabajo y el `worker` lo
 * consume con los extractores reales (Ghostscript para PDF) y un proveedor de embeddings falso.
 */
describe('indexación en el worker, de la cola al `indexado` (019 CA-1, 5, 6, 7, 8, 9, 10, 11, 16, 22)', () => {
  let world: IndexingWorld;
  let ana: StorageClient;

  beforeAll(async () => {
    world = await createIndexingWorld();
  });

  beforeEach(async () => {
    world.embedder.reset();
    ana = await world.storage.newClient();
  });

  afterAll(async () => {
    await world?.close();
  });

  const indexed = async (name: string, bytes: Buffer): Promise<UploadedFile> => {
    const file = await world.upload(ana, uniqueName(name), bytes);
    expect(await world.settled(file.versionId)).toMatchObject({ estado: 'indexado', motivo: null });
    return file;
  };

  const locationsOf = async (fileId: string) =>
    (await world.chunksOf(fileId)).map((chunk) => chunk.procedencia);

  it('CA-1, CA-8: un `.docx` queda `indexado` con su sección, versión y archivo, y se avisa', async () => {
    const bytes = buildDocx([
      { heading: 1, text: 'Alcance' },
      { text: 'El contrato cubre el soporte anual.' },
      { heading: 1, text: 'Pagos' },
      { text: 'Se paga por mes adelantado.' },
    ]);

    const file = await indexed('contrato.docx', bytes);

    const chunks = await world.chunksOf(file.fileId);
    expect(chunks.map((chunk) => chunk.version_archivo_id)).toEqual([
      file.versionId,
      file.versionId,
    ]);
    expect(chunks[1]?.texto).toContain('Se paga por mes adelantado.');
    const sections = chunks.map((chunk) => chunk.procedencia.seccion);
    expect(chunks.map((chunk) => chunk.procedencia.tipo)).toEqual(['docx', 'docx']);
    expect(new Set(sections).size).toBe(2);
    expect(await world.indexingOf(file.versionId)).toMatchObject({ fragmentos: 2 });
    const notices = await world.statusJobsOf(file.fileId);
    expect(notices.map((job) => job.data)).toContainEqual({
      ownerId: ana.id,
      fileId: file.fileId,
      state: 'indexado',
      reason: null,
      correlationId: expect.any(String),
    });
  });

  it('CA-1: un `.txt` queda `indexado` con sus líneas', async () => {
    const file = await indexed('notas.txt', txt('primera línea\nsegunda línea\ntercera línea'));

    expect(await locationsOf(file.fileId)).toEqual([
      { tipo: 'texto', lineaDesde: 1, lineaHasta: 3, confianza: 1 },
    ]);
  });

  itWithGhostscript('CA-1: un `.pdf` queda `indexado` con una página por fragmento', async () => {
    const file = await indexed(
      'informe.pdf',
      await pdfFixture(['Ventas de enero.', 'Ventas de febrero.']),
    );

    expect(await locationsOf(file.fileId)).toEqual([
      expect.objectContaining({ tipo: 'pdf', pagina: 1 }),
      expect.objectContaining({ tipo: 'pdf', pagina: 2 }),
    ]);
  });

  itWithGhostscript(
    'CA-11: un PDF de 50 páginas con latencia simulada del proveedor queda `indexado` en menos de 60 s',
    async () => {
      const pages = Array.from(
        { length: PDF_PAGES },
        (_v, index) => `Informe trimestral, página ${index + 1}. Ventas de la región ${index + 1}.`,
      );
      world.embedder.latencyMs = PDF_EMBEDDING_LATENCY_MS;

      const file = await world.upload(ana, uniqueName('anual.pdf'), await pdfFixture(pages));
      const row = await world.settled(file.versionId);

      expect(row).toMatchObject({ estado: 'indexado', fragmentos: PDF_PAGES });
      expect(row.duracion_ms).toBeLessThan(PDF_MAX_DURATION_MS);
      expect(row.duracion_ms).toBeGreaterThanOrEqual(PDF_EMBEDDING_LATENCY_MS);
      process.stdout.write(`CA-11: PDF de ${PDF_PAGES} páginas en ${String(row.duracion_ms)} ms\n`);
    },
  );

  it('CA-9: el mismo trabajo dos veces deja un solo juego de fragmentos y una sola llamada al proveedor', async () => {
    const file = await indexed('acta.txt', txt('Acta de la reunión de directorio.'));
    const before = await world.chunksOf(file.fileId);
    // El primer trabajo marca `indexado` antes de terminar; mientras exista, BullMQ ignoraría el mismo `jobId`.
    await eventually(async () =>
      (await world.indexingQueue.getJob(file.versionId)) === undefined ? true : null,
    );

    await world.indexingQueue.add(
      INDEXING_JOB,
      { ...file, ownerId: ana.id },
      { jobId: file.versionId },
    );
    await waitForLog(
      world.worker.logs,
      (line) => line.event === 'indexing.discarded' && line.versionId === file.versionId,
    );

    expect(await world.chunksOf(file.fileId)).toEqual(before);
    expect(world.embedder.calls).toBe(1);
  });

  it('CA-10, RN-1: una versión nueva reemplaza los fragmentos y la indexación de la anterior', async () => {
    const name = uniqueName('plan.txt');
    const first = await world.upload(ana, name, txt('Plan viejo.'));
    await world.settled(first.versionId);

    const second = await world.upload(ana, name, txt('Plan nuevo.'), true);

    expect(await world.settled(second.versionId)).toMatchObject({ estado: 'indexado' });
    const chunks = await world.chunksOf(second.fileId);
    expect(chunks.map(({ version_archivo_id, texto }) => ({ version_archivo_id, texto }))).toEqual([
      { version_archivo_id: second.versionId, texto: 'Plan nuevo.' },
    ]);
    expect(await world.indexingOf(first.versionId)).toBeNull();
  });

  it('CA-7: un archivo sobre el tope de bytes → `no_indexable/demasiado_grande` sin llamar al proveedor', async () => {
    const file = await world.upload(
      ana,
      uniqueName('enorme.txt'),
      Buffer.alloc(TEST_MAX_FILE_BYTES + 1, 'a'),
    );

    expect(await world.settled(file.versionId)).toMatchObject({
      estado: 'no_indexable',
      motivo: 'demasiado_grande',
    });
    expect(world.embedder.calls).toBe(0);
    expect(await world.chunksOf(file.fileId)).toEqual([]);
  });

  it('CA-7: más de 5000 fragmentos → `no_indexable/demasiado_grande` sin llamar al proveedor', async () => {
    const blocks = Array.from({ length: OVER_MAX_CHUNKS_SECTIONS }, (_v, index) => [
      { heading: 1 as const, text: `Sección ${index + 1}` },
      { text: `Contenido ${index + 1}.` },
    ]).flat();

    const file = await world.upload(ana, uniqueName('manual.docx'), buildDocx(blocks));

    expect(await world.settled(file.versionId)).toMatchObject({
      estado: 'no_indexable',
      motivo: 'demasiado_grande',
    });
    expect(world.embedder.calls).toBe(0);
  });

  it('CA-5: un `.docx` cuyo contenido no es un documento → `no_indexable/formato_no_soportado`', async () => {
    const file = await world.upload(
      ana,
      uniqueName('falso.docx'),
      buildZip({
        '[Content_Types].xml': PACKAGE_CONTENT_TYPES,
        'word/document.xml': 'esto no es XML <',
      }),
    );

    expect(await world.settled(file.versionId)).toMatchObject({
      estado: 'no_indexable',
      motivo: 'formato_no_soportado',
    });
  });

  /** Sube `name` y corre `midway` justo antes de vectorizar su versión (la del primer trabajo que llega al proveedor). */
  const uploadInterrupted = async (
    name: string,
    midway: (file: UploadedFile) => Promise<void>,
  ): Promise<UploadedFile> => {
    let resolveUploaded: (file: UploadedFile) => void = () => undefined;
    const uploaded = new Promise<UploadedFile>((resolve) => {
      resolveUploaded = resolve;
    });
    world.embedder.onceBeforeEmbed(async () => midway(await uploaded));
    const file = await world.upload(ana, name, txt('Borrador confidencial.'));
    resolveUploaded(file);
    return file;
  };

  const expectDiscardedWithoutError = async (versionId: string): Promise<void> => {
    await waitForLog(
      world.worker.logs,
      (line) => line.event === 'indexing.discarded' && line.versionId === versionId,
    );
    const failures = world.worker.logs
      .lines()
      .filter((line) => line.versionId === versionId && line.event === 'indexing.attempt_failed');
    expect(failures).toEqual([]);
  };

  it('CA-16: purgar el archivo a mitad descarta el trabajo sin error ni fragmentos huérfanos', async () => {
    const file = await uploadInterrupted(uniqueName('borrador.txt'), async ({ fileId }) => {
      expect((await ana.trashFile(fileId)).status).toBeLessThan(300);
      expect((await ana.purgeFile(fileId)).status).toBeLessThan(300);
    });

    await expectDiscardedWithoutError(file.versionId);
    const [counts] = await world.storage.owner.query<
      { fragmentos: string; indexaciones: string }[]
    >(
      `SELECT (SELECT count(*) FROM fragmento WHERE archivo_id = $1) AS fragmentos,
              (SELECT count(*) FROM indexacion WHERE archivo_id = $1) AS indexaciones`,
      [file.fileId],
    );
    expect(counts).toEqual({ fragmentos: '0', indexaciones: '0' });
  });

  it('CA-16: una versión superada a mitad se descarta y solo queda indexada la nueva', async () => {
    const name = uniqueName('borrador.txt');
    let second: UploadedFile | undefined;
    const first = await uploadInterrupted(name, async () => {
      second = await world.upload(ana, name, txt('Versión final.'), true);
    });

    await expectDiscardedWithoutError(first.versionId);
    const latest = await eventually(() => Promise.resolve(second ?? null));
    expect(await world.settled(latest.versionId)).toMatchObject({ estado: 'indexado' });
    const chunks = await world.chunksOf(first.fileId);
    expect(chunks.map((chunk) => chunk.version_archivo_id)).toEqual([latest.versionId]);
    expect(await world.indexingOf(first.versionId)).toBeNull();
  });

  it('CA-22: una cuenta con la suscripción vencida (solo lectura) se indexa igual', async () => {
    await world.storage.owner.query(
      `INSERT INTO suscripcion (usuario_id, plan_id, vence_en)
       SELECT $1, id, now() - interval '1 day' FROM plan WHERE slug = 'pro'`,
      [ana.id],
    );

    await indexed('cartera.txt', txt('Clientes activos del trimestre.'));
  });

  it('CA-6 (T-12): un `.xlsx` y un `.pptx` quedan `indexado` con su hoja y su diapositiva', async () => {
    const sheets = buildXlsx([
      {
        name: 'Ventas',
        rows: [
          ['Mes', 'Total'],
          ['Enero', 120],
        ],
      },
      { name: 'Gastos', rows: [['Alquiler', 40]] },
    ]);
    const slides = buildPptx([{ shapes: [['Objetivos 2027']] }, { shapes: [['Presupuesto']] }]);

    const workbook = await indexed('cuentas.xlsx', sheets);
    const deck = await indexed('plan.pptx', slides);

    expect(await locationsOf(workbook.fileId)).toEqual([
      expect.objectContaining({ tipo: 'xlsx', hoja: 'Ventas' }),
      expect.objectContaining({ tipo: 'xlsx', hoja: 'Gastos' }),
    ]);
    expect(await locationsOf(deck.fileId)).toEqual([
      expect.objectContaining({ tipo: 'pptx', numero: 1 }),
      expect.objectContaining({ tipo: 'pptx', numero: 2 }),
    ]);
  });

  it('CA-6 (T-12): una imagen sigue sin entrar a la cola ni tener indexación', async () => {
    const png = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(PNG_BODY_BYTES, 0x41)]);

    const file = await world.upload(ana, uniqueName('foto.png'), png);
    await settle();

    expect(await world.indexingOf(file.versionId)).toBeNull();
    expect(await world.indexingQueue.getJob(file.versionId)).toBeUndefined();
    expect(world.embedder.calls).toBe(0);
  });
});
