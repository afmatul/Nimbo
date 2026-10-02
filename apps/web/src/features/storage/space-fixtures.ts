import type { SpaceSummaryResponse } from './space-types';

/**
 * DATOS DE EJEMPLO de la pantalla `/espacio` mientras no existe `GET /storage/summary` (spec 007 T-08). T-10 borra este
 * archivo y alimenta la vista con la API real. Las cifras imitan el estado «default» del mockup `resumen-espacio`; no
 * son límites de plan (esos salen siempre de la API).
 */
export const SPACE_SUMMARY_FIXTURE: SpaceSummaryResponse = {
  usedBytes: 4_800_000_000,
  reservedBytes: 0,
  quotaBytes: 15_000_000_000,
  availableBytes: 10_200_000_000,
  maxFileBytes: 50_000_000,
  trashRetentionDays: 7,
  breakdown: {
    documentsBytes: 2_900_000_000,
    imagesBytes: 1_500_000_000,
    otherBytes: 400_000_000,
    trashBytes: 0,
  },
};
