import sharp from 'sharp';

import {
  greyPng,
  jpeg,
  jpegWithOrientationAndP3,
  png16,
  pngWithAlpha,
  pngWithP3,
  truncatedJpeg,
} from '../../../../../test/support/image-fixtures';

import { ImageIntegrityValidator } from './image-integrity.validator';
import { ImageOptimizer } from './image.optimizer';

const CONFIG = { maxPixels: 36_000_000, timeoutMs: 100_000, jpegQuality: 80 };

describe('ImageIntegrityValidator durante estimate (plan 021 §2 y §6, CA-8)', () => {
  const validator = new ImageIntegrityValidator(CONFIG);
  const optimizer = new ImageOptimizer(CONFIG);

  it.each([
    ['JPEG con orientación 6 y P3', jpegWithOrientationAndP3],
    ['PNG RGBA8', pngWithAlpha],
    ['PNG RGB16', png16],
    ['PNG grayscale', greyPng],
    ['PNG con P3', pngWithP3],
  ])('acepta la recompresión íntegra de %s', async (_case, fixture) => {
    const original = await fixture();

    expect(await validator.validate(original, await optimizer.optimize(original))).toBe(true);
  });

  it('rechaza una conversión de formato aunque mantenga dimensiones', async () => {
    const original = await jpegWithOrientationAndP3();
    const candidate = await sharp(original).keepMetadata().png().toBuffer();

    expect(await validator.validate(original, candidate)).toBe(false);
  });

  it('rechaza dimensiones distintas', async () => {
    const original = await pngWithAlpha();
    const candidate = await sharp(original).resize(25, 20).png().toBuffer();

    expect(await validator.validate(original, candidate)).toBe(false);
  });

  it('rechaza la pérdida de orientación EXIF', async () => {
    const original = await jpegWithOrientationAndP3();
    const candidate = await sharp(original).keepIccProfile().jpeg().toBuffer();

    expect(await validator.validate(original, candidate)).toBe(false);
  });

  it.each([jpegWithOrientationAndP3, pngWithP3])(
    'rechaza perder el ICC original',
    async (fixture) => {
      const original = await fixture();
      const candidate = await sharp(original).keepExif().toBuffer();

      expect(await validator.validate(original, candidate)).toBe(false);
    },
  );

  it('rechaza perder el alfa', async () => {
    const original = await pngWithAlpha();
    const candidate = await sharp(original).removeAlpha().png().toBuffer();

    expect(await validator.validate(original, candidate)).toBe(false);
  });

  it('rechaza bajar un PNG de 16 a 8 bits', async () => {
    const original = await png16();
    const candidate = await sharp(original).png().toBuffer();

    expect(await validator.validate(original, candidate)).toBe(false);
  });

  it('rechaza pasar un PNG grayscale a RGB', async () => {
    const original = await greyPng();
    const candidate = await sharp(original).png().toBuffer();

    expect(await validator.validate(original, candidate)).toBe(false);
  });

  it('rechaza píxeles PNG distintos con las mismas dimensiones, profundidad, canales y alfa', async () => {
    const original = await pngWithAlpha();
    const candidate = await sharp(original).linear(1, 1).png().toBuffer();

    expect(await validator.validate(original, candidate)).toBe(false);
  });

  it('rechaza un JPEG truncado aunque su cabecera abra', async () => {
    const original = await jpeg(200, 150);

    expect(await validator.validate(original, await truncatedJpeg())).toBe(false);
  });

  it('rechaza una salida ilegible', async () => {
    expect(await validator.validate(await pngWithAlpha(), Buffer.from('ilegible'))).toBe(false);
  });

  it('el tiempo límite de validación se relanza para reintentar, sin declararlo íntegro', async () => {
    const original = await jpegWithOrientationAndP3();
    const prototype = Object.getPrototypeOf(sharp()) as { stats: () => Promise<unknown> };
    const timeout = new Error('timeout: 61% complete');
    const stats = jest.spyOn(prototype, 'stats').mockRejectedValueOnce(timeout);
    try {
      await expect(validator.validate(original, await optimizer.optimize(original))).rejects.toBe(
        timeout,
      );
    } finally {
      stats.mockRestore();
    }
  });
});
