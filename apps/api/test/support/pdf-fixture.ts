import PDFDocument from 'pdfkit';

/**
 * Generador de PDF mínimos para pruebas (019 D-5): sin binarios versionados. `pdfFixture` escribe una página por
 * cadena con capa de texto; `scannedPdfFixture` dibuja páginas solo con formas, como un escaneado sin OCR (CA-4).
 */
type DrawPage = (pdf: PDFKit.PDFDocument, index: number) => void;

const FIXED_DATE = new Date('2026-10-21T00:00:00Z');
const MARGIN = 72;
const SHAPE_SIZE = 200;

function renderPdf(pageCount: number, drawPage: DrawPage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ autoFirstPage: false, info: { CreationDate: FIXED_DATE } });
    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
    for (let index = 0; index < pageCount; index += 1) {
      pdf.addPage();
      drawPage(pdf, index);
    }
    pdf.end();
  });
}

/** PDF con una página por elemento de `pages`, cada una con ese texto. */
export function pdfFixture(pages: readonly string[]): Promise<Buffer> {
  return renderPdf(pages.length, (pdf, index) => {
    pdf.fontSize(12).text(pages[index] ?? '', MARGIN, MARGIN);
  });
}

/** PDF de `pageCount` páginas sin ninguna capa de texto (rectángulos rellenos, como una imagen escaneada). */
export function scannedPdfFixture(pageCount: number): Promise<Buffer> {
  return renderPdf(pageCount, (pdf) => {
    pdf.rect(MARGIN, MARGIN, SHAPE_SIZE, SHAPE_SIZE).fill();
  });
}
