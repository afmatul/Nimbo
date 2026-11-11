import type { ByteReader } from './ports/i-file-type-detector.port';
import type { IObjectStorage } from './ports/i-object-storage.port';

/** `ByteReader` sobre `IObjectStorage.getRange` para un objeto de `sizeBytes` (el detector de tipo real lee por rangos). */
export function objectByteReader(
  objects: Pick<IObjectStorage, 'getRange'>,
  key: string,
  sizeBytes: bigint,
): ByteReader {
  const size = Number(sizeBytes);
  return {
    size,
    read: (offset, length) => {
      const end = Math.min(offset + length, size);
      return end <= offset
        ? Promise.resolve(Buffer.alloc(0))
        : objects.getRange(key, offset, end - 1);
    },
  };
}
