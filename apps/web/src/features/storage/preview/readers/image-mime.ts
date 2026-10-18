type ImageMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG = [0xff, 0xd8, 0xff] as const;
const GIF87A = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const;
const GIF89A = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;
const RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP = [0x57, 0x45, 0x42, 0x50] as const;

function matchesSignature(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return (
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte)
  );
}

export function detectImageMime(bytes: Uint8Array): ImageMime | null {
  if (matchesSignature(bytes, PNG)) return 'image/png';
  if (matchesSignature(bytes, JPEG)) return 'image/jpeg';
  if (matchesSignature(bytes, GIF87A) || matchesSignature(bytes, GIF89A)) return 'image/gif';
  if (matchesSignature(bytes, RIFF) && matchesSignature(bytes, WEBP, 8)) return 'image/webp';
  return null;
}
