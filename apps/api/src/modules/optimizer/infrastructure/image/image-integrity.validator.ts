import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type { Metadata, Sharp } from 'sharp';

import type { IIntegrityValidator } from '../../application/ports/i-integrity-validator.port';

import { IMAGE_OPTIMIZER_CONFIG, sharpTimeoutSeconds } from './image.optimizer';
import type { ImageOptimizerConfig } from './image.optimizer';

/** EXIF solo se exige si existía; no se promete conservar el resto byte a byte (ADR-0037). */
const sameMetadata = (before: Metadata, after: Metadata): boolean =>
  (before.format === 'jpeg' || before.format === 'png') &&
  before.format === after.format &&
  before.width === after.width &&
  before.height === after.height &&
  before.orientation === after.orientation &&
  (before.exif === undefined || after.exif !== undefined) &&
  (before.icc === undefined || before.icc.equals(after.icc ?? Buffer.alloc(0))) &&
  before.hasAlpha === after.hasAlpha &&
  (before.format !== 'png' ||
    (before.depth === after.depth &&
      before.bitsPerSample === after.bitsPerSample &&
      before.channels === after.channels &&
      before.space === after.space));

/**
 * Valida antes de ofrecer el ahorro (plan §6): abre la salida y compara CA-8. En PNG calcula hashes secuenciales por
 * flujo, sin almacenar dos imágenes crudas; conserva espacio de color y profundidad al decodificar los píxeles.
 * Una salida dañada es `false`; el tiempo límite se relanza para los reintentos de la cola (CA-14).
 */
@Injectable()
export class ImageIntegrityValidator implements IIntegrityValidator {
  constructor(@Inject(IMAGE_OPTIMIZER_CONFIG) private readonly config: ImageOptimizerConfig) {}

  async validate(original: Buffer, candidate: Buffer): Promise<boolean> {
    try {
      const before = await this.image(original).metadata();
      const after = await this.image(candidate).metadata();
      if (!sameMetadata(before, after)) return false;
      if (before.format === 'png') {
        const originalHash = await this.pixelHash(original, before);
        return originalHash === (await this.pixelHash(candidate, after));
      }
      await this.image(candidate).stats();
      return true;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('timeout')) throw error;
      return false;
    }
  }

  private image(content: Buffer): Sharp {
    // Compara muestras originales: aplicar el ICC podría convertir o recortar colores y ocultar diferencias.
    return sharp(content, { limitInputPixels: this.config.maxPixels, ignoreIcc: true }).timeout({
      seconds: sharpTimeoutSeconds(this.config),
    });
  }

  private async pixelHash(content: Buffer, metadata: Metadata): Promise<string> {
    const image = this.image(content);
    if (metadata.space !== undefined) image.toColourspace(metadata.space);
    const hash = createHash('sha256');
    await pipeline(image.raw({ depth: metadata.depth === 'ushort' ? 'ushort' : 'uchar' }), hash);
    return hash.digest('hex');
  }
}
