import { crc32 } from 'node:zlib';

import sharp from 'sharp';

/**
 * Imágenes pequeñas y deterministas para las pruebas del optimizador (021 T-03, plan §7), generadas en memoria con
 * `sharp`: nada de *fixtures* grandes versionados. Los píxeles son un degradado (recomprimible) o ruido pseudoaleatorio
 * con semilla fija; nunca contenido real.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Degradado de `channels` canales y `depth` bits, determinista. */
function gradient(width: number, height: number, channels: 1 | 2 | 3 | 4, depth: 8 | 16 = 8) {
  const samples = width * height * channels;
  const pixels = Buffer.alloc(samples * (depth / 8));
  for (let index = 0; index < samples; index += 1) {
    const value = (index * 7 + Math.floor(index / width) * 13) % (depth === 8 ? 256 : 65_536);
    if (depth === 8) pixels[index] = value;
    else pixels.writeUInt16LE(value, index * 2);
  }
  return {
    pixels,
    raw: { width, height, channels, ...(depth === 16 ? { depth: 'ushort' as const } : {}) },
  };
}

const fromGradient = (
  width: number,
  height: number,
  channels: 1 | 2 | 3 | 4,
  depth: 8 | 16 = 8,
) => {
  const { pixels, raw } = gradient(width, height, channels, depth);
  return sharp(pixels, { raw });
};

/** JPEG de calidad 95 (recomprimible a 80); por defecto sin EXIF ni perfil. */
export const jpeg = (width = 64, height = 32): Promise<Buffer> =>
  fromGradient(width, height, 3).jpeg({ quality: 95 }).toBuffer();

/** JPEG con orientación EXIF 6 (se ve rotado 90°) y perfil ICC Display P3 (no sRGB). */
export const jpegWithOrientationAndP3 = (width = 64, height = 32): Promise<Buffer> =>
  fromGradient(width, height, 3)
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .withIccProfile('p3')
    .toBuffer();

/** JPEG en escala de grises (un canal). */
export const greyJpeg = (): Promise<Buffer> =>
  fromGradient(48, 32, 1).toColourspace('b-w').jpeg({ quality: 95 }).toBuffer();

/** PNG sin comprimir con alfa (RGBA de 8 bits). */
export const pngWithAlpha = (width = 50, height = 40): Promise<Buffer> =>
  fromGradient(width, height, 4).png({ compressionLevel: 0 }).toBuffer();

/** PNG sin comprimir con perfil ICC Display P3 (no sRGB). */
export const pngWithP3 = (): Promise<Buffer> =>
  fromGradient(40, 30, 3).withIccProfile('p3').png({ compressionLevel: 0 }).toBuffer();

/** PNG sin comprimir de 16 bits por muestra (RGB). */
export const png16 = (): Promise<Buffer> =>
  fromGradient(40, 30, 3, 16).toColourspace('rgb16').png({ compressionLevel: 0 }).toBuffer();

/** PNG sin comprimir en escala de grises (un canal). */
export const greyPng = (): Promise<Buffer> =>
  fromGradient(40, 30, 1).toColourspace('b-w').png({ compressionLevel: 0 }).toBuffer();

export const gif = (): Promise<Buffer> => fromGradient(16, 16, 3).gif().toBuffer();
export const webp = (): Promise<Buffer> => fromGradient(16, 16, 3).webp().toBuffer();

interface PngChunk {
  readonly type: string;
  readonly data: Buffer;
}

function chunksOf(png: Buffer): PngChunk[] {
  const chunks: PngChunk[] = [];
  for (let offset = PNG_SIGNATURE.length; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    chunks.push({
      type: png.toString('latin1', offset + 4, offset + 8),
      data: png.subarray(offset + 8, offset + 8 + length),
    });
    offset += 12 + length;
  }
  return chunks;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

const uint32 = (...values: number[]): Buffer => {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeUInt32BE(value, index * 4));
  return buffer;
};

/** `fcTL` de un cuadro de `size` × `size` en el origen, 100 ms (APNG). */
function frameControl(sequence: number, size: number): Buffer {
  const data = Buffer.alloc(26);
  uint32(sequence, size, size, 0, 0).copy(data);
  data.writeUInt16BE(1, 20);
  data.writeUInt16BE(10, 22);
  return data;
}

/** PNG animado (APNG) de dos cuadros de 8 × 8: `acTL`, `fcTL` + `IDAT` y `fcTL` + `fdAT`. */
export async function animatedPng(): Promise<Buffer> {
  const frame = await fromGradient(8, 8, 3).png().toBuffer();
  const chunks = chunksOf(frame);
  const header = chunks.find((item) => item.type === 'IHDR');
  const image = chunks.filter((item) => item.type === 'IDAT').map((item) => item.data);
  if (header === undefined) throw new Error('El PNG generado no tiene IHDR.');
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header.data),
    chunk('acTL', uint32(2, 0)),
    chunk('fcTL', frameControl(0, 8)),
    ...image.map((data) => chunk('IDAT', data)),
    chunk('fcTL', frameControl(1, 8)),
    chunk('fdAT', Buffer.concat([uint32(2), ...image])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** PNG cuya cabecera declara `width` × `height` con datos de 8 × 8: lo que importa es que no se decodifica. */
export async function pngDeclaring(width: number, height: number): Promise<Buffer> {
  const chunks = chunksOf(await fromGradient(8, 8, 3).png().toBuffer());
  return Buffer.concat([
    PNG_SIGNATURE,
    ...chunks.map(({ type, data }) => {
      if (type !== 'IHDR') return chunk(type, data);
      const header = Buffer.from(data);
      header.writeUInt32BE(width, 0);
      header.writeUInt32BE(height, 4);
      return chunk(type, header);
    }),
  ]);
}

/** Ruido pseudoaleatorio de `channels` canales con semilla fija: casi incompresible. */
function noise(width: number, height: number, channels: 3 | 4 = 3): Buffer {
  const pixels = Buffer.alloc(width * height * channels);
  let seed = 7;
  for (let index = 0; index < pixels.length; index += 1) {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
    pixels[index] = (seed >> 16) & 0xff;
  }
  return pixels;
}

/** PNG de ruido ya comprimido al máximo: recomprimirlo no ahorra (→ «no conviene»). */
export const noisyPng = (width = 100, height = 100): Promise<Buffer> =>
  sharp(noise(width, height), { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

/** JPEG con ruido cortado a la mitad: la cabecera se lee, los datos no. */
export async function truncatedJpeg(): Promise<Buffer> {
  const width = 200;
  const height = 150;
  const whole = await sharp(noise(width, height), { raw: { width, height, channels: 3 } })
    .jpeg()
    .toBuffer();
  return whole.subarray(0, Math.floor(whole.length / 2));
}
