/**
 * Única entrada de zip.js: pública en `exports`, sin WASM ni worker inline. Incluye el respaldo zlib en JS
 * porque el target declarado de Next (Chrome 64, Firefox 67, Safari 12) no garantiza
 * `DecompressionStream('deflate-raw')`.
 */
export {
  configure,
  Reader,
  ZipReader,
  ERR_AMBIGUOUS_ARCHIVE,
  ERR_BAD_FORMAT,
  ERR_CENTRAL_DIRECTORY_NOT_FOUND,
  ERR_CODEC_OUT_OF_MEMORY,
  ERR_ENCRYPTED,
  ERR_ENCRYPTED_CENTRAL_DIRECTORY,
  ERR_ENTRY_DATA_OUT_OF_BOUNDS,
  ERR_EOCDR_LOCATOR_ZIP64_NOT_FOUND,
  ERR_EOCDR_NOT_FOUND,
  ERR_EXTRAFIELD_ZIP64_NOT_FOUND,
  ERR_INVALID_COMPRESSED_DATA,
  ERR_INVALID_CRC32,
  ERR_INVALID_PASSWORD,
  ERR_INVALID_UNCOMPRESSED_SIZE,
  ERR_LOCAL_FILE_HEADER_NOT_FOUND,
  ERR_OVERLAPPING_ENTRY,
  ERR_SPLIT_ZIP_FILE,
  ERR_UNSAFE_FILENAME,
  ERR_UNSUPPORTED_COMPRESSION,
  ERR_UNSUPPORTED_ENCRYPTION,
  ERR_UNSUPPORTED_UINT64,
} from '@zip.js/zip.js/lib/zip-core-native.js';
export type { Entry, FileEntry } from '@zip.js/zip.js/lib/zip-core-native.js';
