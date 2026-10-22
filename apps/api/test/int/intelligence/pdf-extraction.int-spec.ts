import { Chunker } from '../../../src/modules/intelligence/domain/chunker';
import { PdfLocation } from '../../../src/modules/intelligence/domain/pdf-location';
import { PdfExtractor } from '../../../src/modules/intelligence/infrastructure/extractors/pdf.extractor';
import { ChildProcessRunner } from '../../../src/modules/intelligence/infrastructure/process/child-process.runner';
import { describeWithGhostscript, GHOSTSCRIPT_BIN } from '../../support/ghostscript';
import { pdfFixture, scannedPdfFixture } from '../../support/pdf-fixture';

const PAGE_COUNT = 50;
const pageText = (page: number): string =>
  `Informe trimestral, página ${page}. Ventas de la región ${page} con detalle por mes.`;

/** `PdfExtractor` con Ghostscript real (019 T-04; CA-2, CA-4, CA-5); omitida solo fuera de CI sin el binario. */
describeWithGhostscript('PdfExtractor con Ghostscript real', () => {
  const extractor = new PdfExtractor(new ChildProcessRunner(), { bin: GHOSTSCRIPT_BIN });

  it('CA-2: un PDF de 50 páginas da un segmento por página y ningún fragmento mezcla páginas', async () => {
    const pages = Array.from({ length: PAGE_COUNT }, (_v, index) => pageText(index + 1));

    const segments = await extractor.extract(await pdfFixture(pages));
    const chunks = new Chunker().split(segments);

    expect(segments.map((segment) => segment.location.label())).toEqual(
      pages.map((_text, index) => `Página ${index + 1}`),
    );
    expect(segments[0]?.text).toContain('Informe trimestral, página 1.');
    expect(chunks).toHaveLength(PAGE_COUNT);
    chunks.forEach((chunk, index) => {
      expect(chunk.location).toEqual(PdfLocation.page(index + 1));
      expect(chunk.text).toContain(`página ${index + 1}.`);
    });
  });

  it('CA-4: un PDF escaneado (sin capa de texto) → `sin_texto`', async () => {
    await expect(extractor.extract(await scannedPdfFixture(3))).rejects.toMatchObject({
      name: 'NotIndexableError',
      reason: 'sin_texto',
    });
  });

  it('CA-5: un contenido con firma de PDF pero dañado → `formato_no_soportado`', async () => {
    const damaged = Buffer.from('%PDF-1.7\nesto no es un PDF\n%%EOF', 'latin1');

    await expect(extractor.extract(damaged)).rejects.toMatchObject({
      name: 'NotIndexableError',
      reason: 'formato_no_soportado',
    });
  });
});
