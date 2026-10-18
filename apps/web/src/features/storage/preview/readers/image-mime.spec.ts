import { detectImageMime } from './image-mime';

// Son firmas sintéticas mínimas, no archivos completos que deban superar un decoder.
const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = Uint8Array.of(0xff, 0xd8, 0xff);
const WEBP = Uint8Array.of(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

describe('image-mime T-07: firmas permitidas sin metadata', () => {
  describe('PNG', () => {
    it('CA-1: identifica los ocho bytes exactos de la firma PNG', () => {
      expect(detectImageMime(PNG)).toBe('image/png');
    });

    it('CA-2: rechaza una cabecera PNG incompleta', () => {
      expect(detectImageMime(PNG.subarray(0, 7))).toBeNull();
    });

    it('CA-2: rechaza PNG con el primer byte incorrecto', () => {
      expect(detectImageMime(Uint8Array.of(0x88, ...PNG.subarray(1)))).toBeNull();
    });

    it('CA-2: rechaza una firma parecida a PNG con el último byte alterado', () => {
      expect(detectImageMime(Uint8Array.of(...PNG.subarray(0, 7), 0x0b))).toBeNull();
    });
  });

  describe('JPEG', () => {
    it('CA-1: identifica JPEG por FF D8 FF sin necesitar nombre ni extensión', () => {
      expect(detectImageMime(JPEG)).toBe('image/jpeg');
    });

    it('CA-2: rechaza una firma JPEG incompleta', () => {
      expect(detectImageMime(JPEG.subarray(0, 2))).toBeNull();
    });

    it.each([
      ['primer byte incorrecto', Uint8Array.of(0x00, 0xd8, 0xff)],
      ['tercer byte incorrecto', Uint8Array.of(0xff, 0xd8, 0x00)],
    ] as const)('CA-2: rechaza JPEG con %s', (_label, bytes) => {
      expect(detectImageMime(bytes)).toBeNull();
    });
  });

  describe('GIF', () => {
    it.each(['GIF87a', 'GIF89a'])('CA-1: identifica la firma %s', (signature) => {
      expect(detectImageMime(ascii(signature))).toBe('image/gif');
    });

    it.each(['GIF87b', 'GIF89b'])(
      'CA-2: rechaza la versión de firma GIF no admitida %s',
      (signature) => {
        expect(detectImageMime(ascii(signature))).toBeNull();
      },
    );

    it('CA-2: rechaza GIF incompleto', () => {
      expect(detectImageMime(ascii('GIF89'))).toBeNull();
    });

    it('CA-2: rechaza texto que solo comienza por GIF', () => {
      expect(detectImageMime(ascii('GIF es solo texto'))).toBeNull();
    });
  });

  describe('WebP', () => {
    it('CA-1: identifica RIFF en 0..3 y WEBP en 8..11 sin validar el archivo completo', () => {
      expect(detectImageMime(WEBP)).toBe('image/webp');
    });

    it('CA-2: rechaza RIFF de otro formato', () => {
      expect(detectImageMime(ascii('RIFF....AVI '))).toBeNull();
    });

    it('CA-2: rechaza WEBP en 8..11 si no empieza por RIFF', () => {
      expect(detectImageMime(ascii('NOPE....WEBP'))).toBeNull();
    });

    it('CA-2: rechaza una cabecera WebP incompleta', () => {
      expect(detectImageMime(WEBP.subarray(0, 11))).toBeNull();
    });

    it('CA-2: rechaza WEBP en un offset distinto de ocho', () => {
      expect(detectImageMime(ascii('RIFFWEBP....'))).toBeNull();
    });
  });

  describe('formatos no permitidos y entradas sin firma', () => {
    it.each([
      ['SVG textual', ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
      ['PDF', ascii('%PDF-1.7')],
      ['ZIP/OOXML', Uint8Array.of(0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0)],
      ['TXT', ascii('Texto de prueba sin firma binaria')],
      ['bytes vacíos', new Uint8Array(0)],
      ['Uint8Array muy corto', Uint8Array.of(0xff)],
      ['bytes aleatorios', Uint8Array.of(0x13, 0x7a, 0x24, 0xb1, 0x06, 0x90, 0xc3, 0x5e)],
    ] as const)('CA-2: rechaza %s', (_label, bytes) => {
      expect(detectImageMime(bytes)).toBeNull();
    });
  });

  it('CA-11: solo inspecciona bytes, sin mutarlos, hacer fetch ni escribir en consola', () => {
    const fetchCall = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
    try {
      const bytes = PNG.slice();
      const before = bytes.slice();
      expect(detectImageMime(bytes)).toBe('image/png');
      expect(bytes).toEqual(before);
      expect(fetchCall).toHaveBeenCalledTimes(0);
      for (const log of logs) expect(log).toHaveBeenCalledTimes(0);
    } finally {
      jest.restoreAllMocks();
    }
  });
});
