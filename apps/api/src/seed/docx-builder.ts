import { strToU8, zipSync } from 'fflate';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
/** Fecha fija: el mismo texto produce siempre los mismos bytes, así el corpus puede calcular tamaños exactos. */
const FIXED_TIME = new Date(Date.UTC(2026, 0, 1));

const escapeXml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const paragraph = (line: string): string =>
  `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;

/**
 * Un `.docx` real y mínimo (paquete OOXML con un párrafo por línea) que se abre en ONLYOFFICE y Word. La semilla lo usa
 * para que las vistas previas, la indexación y la edición trabajen con documentos de verdad, no con texto plano.
 */
export function buildDocx(text: string): Buffer {
  const body = text.split('\n').map(paragraph).join('');
  const entries = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL}">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`,
    ),
  };
  return Buffer.from(zipSync(entries, { mtime: FIXED_TIME }));
}
