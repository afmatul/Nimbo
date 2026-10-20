/** Partes que el detector exige para reconocer un `.docx` (OOXML de Word). */
const DOCX_PARTS = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'] as const;

const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_CENTRAL_ENTRY = 0x02014b50;
const ZIP_EOCD = 0x06054b50;
const LOCAL_HEADER_BYTES = 30;
const CENTRAL_ENTRY_BYTES = 46;
const CENTRAL_NAME_LENGTH_OFFSET = 28;
const EOCD_BYTES = 22;

const centralEntry = (name: string): Buffer => {
  const header = Buffer.alloc(CENTRAL_ENTRY_BYTES, 0);
  header.writeUInt32LE(ZIP_CENTRAL_ENTRY, 0);
  header.writeUInt16LE(Buffer.byteLength(name), CENTRAL_NAME_LENGTH_OFFSET);
  return Buffer.concat([header, Buffer.from(name, 'utf8')]);
};

/**
 * Bytes que pasan la verificación de `.docx` de `MagicBytesDetector` (ZIP con las partes de Word), del tamaño pedido
 * (mínimo, el del ZIP vacío de contenido). No es un documento que Word abra: solo sirve para el arnés.
 */
export const docxBytes = (paddingBytes = 1024): Buffer => {
  const local = Buffer.alloc(LOCAL_HEADER_BYTES, 0);
  local.writeUInt32LE(ZIP_LOCAL_HEADER, 0);
  const body = Buffer.concat([local, Buffer.alloc(paddingBytes, 0x20)]);
  const directory = Buffer.concat(DOCX_PARTS.map(centralEntry));
  const eocd = Buffer.alloc(EOCD_BYTES, 0);
  eocd.writeUInt32LE(ZIP_EOCD, 0);
  eocd.writeUInt16LE(DOCX_PARTS.length, 8);
  eocd.writeUInt16LE(DOCX_PARTS.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, directory, eocd]);
};
