// Assets del paquete fijado: emitir bytes locales, no módulos ejecutables ni CDN.
const { createHash } = require('node:crypto');
const { basename, extname } = require('node:path');

module.exports = function emitPdfAsset(content) {
  const extension = extname(this.resourcePath);
  const name = basename(this.resourcePath, extension);
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  const filename = `static/media/pdfjs/${name}.${hash}${extension}`;
  this.emitFile(filename, content);
  return `module.exports = __webpack_public_path__ + ${JSON.stringify(filename)};`;
};
module.exports.raw = true;
