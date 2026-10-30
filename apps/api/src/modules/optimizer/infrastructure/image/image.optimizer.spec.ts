import sharp, { cache, concurrency } from 'sharp';

import {
  animatedPng,
  gif,
  greyJpeg,
  greyPng,
  jpeg,
  jpegWithOrientationAndP3,
  png16,
  pngDeclaring,
  pngWithAlpha,
  pngWithP3,
  truncatedJpeg,
  webp,
} from '../../../../../test/support/image-fixtures';
import { UnreadableImageError } from '../../domain/errors';

import { ImageOptimizer } from './image.optimizer';
import type { ImageOptimizerConfig } from './image.optimizer';

const CONFIG: ImageOptimizerConfig = { maxPixels: 36_000_000, timeoutMs: 100_000, jpegQuality: 80 };

/** Píxeles crudos con la profundidad original (16 bits se comparan como 16 bits). */
const rawOf = async (image: Buffer): Promise<Buffer> => {
  const { depth } = await sharp(image).metadata();
  return sharp(image)
    .raw({ depth: depth === 'ushort' ? 'ushort' : 'uchar' })
    .toBuffer();
};

describe('ImageOptimizer con `sharp` real (plan 021 §2 y §6, ADR-0037)', () => {
  const optimizer = new ImageOptimizer(CONFIG);

  it('ADR-0037: un hilo de libvips y sin caché', () => {
    expect(concurrency()).toBe(1);
    expect(cache().items.max).toBe(0);
  });

  describe('JPEG', () => {
    it('inspecciona formato, dimensiones guardadas, orientación, perfil, EXIF, alfa y píxeles', async () => {
      const inspection = await optimizer.inspect(await jpegWithOrientationAndP3(64, 32));

      expect(inspection).toEqual({
        format: 'jpeg',
        width: 64,
        height: 32,
        pixels: 2048,
        orientation: 6,
        hasIccProfile: true,
        hasExif: true,
        hasAlpha: false,
        animated: false,
      });
    });

    it('CA-8: recomprime en JPEG, **sin rotar** (mismo ancho y alto), con la orientación 6 y el perfil P3 idéntico', async () => {
      const original = await jpegWithOrientationAndP3(64, 32);
      const before = await sharp(original).metadata();

      const result = await optimizer.optimize(original);
      const after = await sharp(result).metadata();

      expect(after.format).toBe('jpeg');
      expect([after.width, after.height]).toEqual([64, 32]);
      expect(after.orientation).toBe(6);
      expect(after.icc?.equals(before.icc ?? Buffer.alloc(0))).toBe(true);
      expect(result.length).toBeLessThan(original.length);
    });

    it('ADR-0037: sin EXIF en la entrada no lo agrega (ni orientación 1) y sin perfil no inventa uno', async () => {
      const result = await optimizer.optimize(await jpeg());
      const after = await sharp(result).metadata();

      expect(after.exif).toBeUndefined();
      expect(after.orientation).toBeUndefined();
      expect(after.icc).toBeUndefined();
    });

    it('un JPEG en escala de grises sigue en grises (no pasa a RGB)', async () => {
      const after = await sharp(await optimizer.optimize(await greyJpeg())).metadata();

      expect(after.channels).toBe(1);
      expect(after.space).toBe('b-w');
    });
  });

  describe('PNG', () => {
    it('inspecciona un PNG estático con alfa', async () => {
      const inspection = await optimizer.inspect(await pngWithAlpha(50, 40));

      expect(inspection).toMatchObject({
        format: 'png',
        width: 50,
        height: 40,
        pixels: 2000,
        hasAlpha: true,
        animated: false,
      });
    });

    it('CA-8: recomprime sin pérdida: PNG, mismas dimensiones, alfa, sin paleta y píxeles idénticos', async () => {
      const original = await pngWithAlpha(50, 40);

      const result = await optimizer.optimize(original);
      const after = await sharp(result).metadata();

      expect(after.format).toBe('png');
      expect([after.width, after.height, after.channels]).toEqual([50, 40, 4]);
      expect(after.hasAlpha).toBe(true);
      expect(after.isPalette).toBe(false);
      expect((await rawOf(result)).equals(await rawOf(original))).toBe(true);
      expect(result.length).toBeLessThan(original.length);
    });

    it('CA-8: un PNG con perfil P3 conserva el perfil idéntico y los píxeles (sin convertir a sRGB)', async () => {
      const original = await pngWithP3();
      const before = await sharp(original).metadata();

      const result = await optimizer.optimize(original);
      const after = await sharp(result).metadata();

      expect(after.icc?.equals(before.icc ?? Buffer.alloc(0))).toBe(true);
      expect((await rawOf(result)).equals(await rawOf(original))).toBe(true);
    });

    it.each([
      ['16 bits por muestra', png16, 16, 3],
      ['en escala de grises', greyPng, 8, 1],
    ])(
      'RN-6: un PNG %s conserva profundidad, canales y píxeles (sin pasar a 8 bits ni a RGB)',
      async (_case, fixture, bits, channels) => {
        const original = await fixture();

        const result = await optimizer.optimize(original);
        const after = await sharp(result).metadata();

        expect([after.bitsPerSample, after.channels]).toEqual([bits, channels]);
        expect((await rawOf(result)).equals(await rawOf(original))).toBe(true);
      },
    );

    it('RN-1: un PNG animado (`acTL`) se reconoce como tal; `sharp` lo leería como un solo cuadro', async () => {
      const apng = await animatedPng();

      const inspection = await optimizer.inspect(apng);
      const seenBySharp = await sharp(apng, { animated: true }).metadata();

      expect(inspection).toMatchObject({ format: 'png', width: 8, height: 8, animated: true });
      expect(seenBySharp.pages ?? 1).toBe(1);
    });
  });

  describe('límites y lectura (CA-5, RN-8)', () => {
    it('RN-8: informa los píxeles de la cabecera sin decodificar, aunque superen cualquier tope', async () => {
      const inspection = await optimizer.inspect(await pngDeclaring(100_000, 100_000));

      expect(inspection.pixels).toBe(10_000_000_000);
    });

    it('RN-8: una imagen chica informa sus píxeles reales (ancho × alto)', async () => {
      expect((await optimizer.inspect(await jpeg(60, 50))).pixels).toBe(3000);
    });

    it.each([
      ['datos que no son una imagen', () => Promise.resolve(Buffer.from('no es una imagen'))],
      ['un GIF', gif],
      ['un WebP', webp],
    ])('CA-3, CA-5: %s no se inspecciona: `UnreadableImageError`', async (_case, fixture) => {
      await expect(optimizer.inspect(await fixture())).rejects.toBeInstanceOf(UnreadableImageError);
    });

    it('CA-5: un JPEG truncado se inspecciona, pero recomprimirlo lanza `UnreadableImageError`', async () => {
      const truncated = await truncatedJpeg();

      await expect(optimizer.inspect(truncated)).resolves.toMatchObject({ format: 'jpeg' });
      await expect(optimizer.optimize(truncated)).rejects.toBeInstanceOf(UnreadableImageError);
    });
  });

  describe('tiempo límite (CA-14)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('corta cada recompresión con `OPTIMIZER_TIMEOUT_MS` redondeado a segundos', async () => {
      const input = await jpeg();
      const prototype = Object.getPrototypeOf(sharp()) as { timeout: (options: object) => unknown };
      const timeout = jest.spyOn(prototype, 'timeout');

      await new ImageOptimizer({ ...CONFIG, timeoutMs: 1500 }).optimize(input);

      expect(timeout).toHaveBeenCalledWith({ seconds: 2 });
    });

    it('un corte por tiempo límite **no** es ilegible: se relanza tal cual para que la cola reintente', async () => {
      const input = await jpeg();
      const prototype = Object.getPrototypeOf(sharp()) as { toBuffer: () => Promise<Buffer> };
      const timedOut = new Error('timeout: 61% complete\nVipsImage: killed for image');
      jest.spyOn(prototype, 'toBuffer').mockRejectedValueOnce(timedOut);

      await expect(optimizer.optimize(input)).rejects.toBe(timedOut);
    });
  });
});
