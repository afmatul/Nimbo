import { Inject, Injectable } from '@nestjs/common';
import sharp, { cache, concurrency } from 'sharp';
import type { Metadata, Sharp } from 'sharp';

import type {
  ImageFormat,
  ImageInspection,
  IOptimizer,
} from '../../application/ports/i-optimizer.port';
import { UnreadableImageError } from '../../domain/errors';

/** Valores de `env.schema.ts` que la recompresión usa (plan 021 §6). */
export interface ImageOptimizerConfig {
  /** `OPTIMIZER_MAX_PIXELS`: `limitInputPixels` al decodificar, segunda barrera tras la del flujo (RN-8). */
  readonly maxPixels: number;
  /** `OPTIMIZER_TIMEOUT_MS`: tiempo límite de cada recompresión (CA-14). */
  readonly timeoutMs: number;
  /** `OPTIMIZER_JPEG_QUALITY`, con mozjpeg. */
  readonly jpegQuality: number;
}

export const IMAGE_OPTIMIZER_CONFIG = Symbol('ImageOptimizerConfig');

/** PNG sin pérdida (plan §6): compresión máxima, filtrado adaptativo y **sin** paleta, que cambiaría píxeles. */
const PNG_OPTIONS = { compressionLevel: 9, adaptiveFiltering: true, palette: false } as const;
const SUPPORTED: readonly string[] = ['jpeg', 'png'] satisfies ImageFormat[];
const PNG_SIGNATURE_BYTES = 8;
/** Largo, tipo y CRC de un fragmento PNG. */
const PNG_CHUNK_OVERHEAD = 12;
const MS_PER_SECOND = 1000;

/** `sharp` mide el tiempo límite en segundos enteros: se redondea hacia arriba. */
export const sharpTimeoutSeconds = ({ timeoutMs }: Pick<ImageOptimizerConfig, 'timeoutMs'>): number =>
  Math.ceil(timeoutMs / MS_PER_SECOND);

type SupportedMetadata = Metadata & {
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
};

const isSupported = (metadata: Metadata): metadata is SupportedMetadata =>
  metadata.format !== undefined &&
  SUPPORTED.includes(metadata.format) &&
  metadata.width !== undefined &&
  metadata.height !== undefined;

/** `sharp` corta por tiempo con «timeout: N% complete»: es transitorio, no una imagen ilegible. */
const isTimeout = (error: unknown): boolean =>
  error instanceof Error && error.message.startsWith('timeout');

/**
 * APNG: el fragmento `acTL` va antes del primer `IDAT` (especificación APNG). Se busca en la cabecera porque `sharp`
 * lee un APNG como un PNG de un solo cuadro (sin `pages`, ni con `animated: true`; comprobado en T-03).
 */
export function hasAnimationControl(png: Buffer): boolean {
  let offset = PNG_SIGNATURE_BYTES;
  while (offset + PNG_CHUNK_OVERHEAD <= png.length) {
    const type = png.toString('latin1', offset + 4, offset + 8);
    if (type === 'acTL') return true;
    if (type === 'IDAT') return false;
    offset += PNG_CHUNK_OVERHEAD + png.readUInt32BE(offset);
  }
  return false;
}

const toInspection = (metadata: SupportedMetadata, content: Buffer): ImageInspection => ({
  format: metadata.format,
  width: metadata.width,
  height: metadata.height,
  pixels: metadata.width * metadata.height,
  orientation: metadata.orientation ?? null,
  hasIccProfile: metadata.icc !== undefined,
  hasExif: metadata.exif !== undefined,
  hasAlpha: metadata.hasAlpha,
  animated: metadata.format === 'png' && hasAnimationControl(content),
});

/**
 * `IOptimizer` con `sharp` (ADR-0037), solo en el `worker`: un hilo de libvips y sin caché. Inspecciona leyendo la
 * cabecera **sin decodificar** (sin tope: el flujo decide con los píxeles informados). Recomprime en el mismo formato y
 * el mismo espacio de color (un PNG de 16 bits o en grises no pasa a 8 bits ni a RGB), **sin rotar**: `sharp` descarta
 * los metadatos por defecto, así que se pide `keepIccProfile()` siempre y `keepExif()` solo si la entrada trae EXIF; no
 * `withMetadata()`, que cambia un perfil no sRGB por sRGB. JPEG con mozjpeg; PNG sin pérdida.
 */
@Injectable()
export class ImageOptimizer implements IOptimizer {
  constructor(@Inject(IMAGE_OPTIMIZER_CONFIG) private readonly config: ImageOptimizerConfig) {
    concurrency(1);
    cache(false);
  }

  async inspect(content: Buffer): Promise<ImageInspection> {
    return toInspection(await this.metadataOf(content), content);
  }

  async optimize(content: Buffer): Promise<Buffer> {
    const metadata = await this.metadataOf(content);
    try {
      return await this.pipeline(content, metadata).toBuffer();
    } catch (error) {
      if (isTimeout(error)) throw error;
      throw new UnreadableImageError(error);
    }
  }

  /** Cabecera de un JPEG o PNG legible; cualquier otra cosa es `UnreadableImageError`. */
  private async metadataOf(content: Buffer): Promise<SupportedMetadata> {
    let metadata: Metadata;
    try {
      metadata = await sharp(content, { limitInputPixels: false }).metadata();
    } catch (error) {
      throw new UnreadableImageError(error);
    }
    if (!isSupported(metadata)) throw new UnreadableImageError(null);
    return metadata;
  }

  private pipeline(content: Buffer, metadata: SupportedMetadata): Sharp {
    const image = sharp(content, { limitInputPixels: this.config.maxPixels })
      .timeout({ seconds: sharpTimeoutSeconds(this.config) })
      .keepIccProfile();
    if (metadata.exif !== undefined) image.keepExif();
    if (metadata.space !== undefined) image.toColourspace(metadata.space);
    return metadata.format === 'jpeg'
      ? image.jpeg({ quality: this.config.jpegQuality, mozjpeg: true })
      : image.png(PNG_OPTIONS);
  }
}
