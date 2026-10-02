import type { SpaceSummaryResponse } from './space-types';

/** Constructor de resúmenes de espacio para pruebas: segmentos + papelera = usado; disponible = cuota − usado − reservas. */
export const GB = 1_000_000_000;
export const TEST_QUOTA_BYTES = 15 * GB;

interface SpaceExtras {
  readonly trashBytes?: number;
  readonly reservedBytes?: number;
}

/** Las cifras se redondean a bytes enteros: `14.1 * GB` no es exacto en coma flotante. */
export function spaceSummaryWith(used: number, extras: SpaceExtras = {}): SpaceSummaryResponse {
  const usedBytes = Math.round(used);
  const trashBytes = Math.round(extras.trashBytes ?? 0);
  const reservedBytes = Math.round(extras.reservedBytes ?? 0);
  const live = usedBytes - trashBytes;
  const documentsBytes = Math.round(live * 0.6);
  const imagesBytes = Math.round(live * 0.3);
  return {
    usedBytes,
    reservedBytes,
    quotaBytes: TEST_QUOTA_BYTES,
    availableBytes: Math.max(0, TEST_QUOTA_BYTES - usedBytes - reservedBytes),
    maxFileBytes: 50_000_000,
    trashRetentionDays: 7,
    breakdown: {
      documentsBytes,
      imagesBytes,
      otherBytes: live - documentsBytes - imagesBytes,
      trashBytes,
    },
  };
}
