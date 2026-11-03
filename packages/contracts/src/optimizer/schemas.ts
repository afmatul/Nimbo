import { z } from 'zod';

import { byteCount, timestamp, uuidSchema } from '../storage/schema-fields';

/** Estados de una optimización (spec 021, plan §3), los del `CHECK` de `optimizacion.estado`. */
export const OPTIMIZATION_STATES = [
  'estimando',
  'estimada',
  'no_conviene',
  'no_disponible',
  'optimizando',
  'completada',
  'descartada',
  'fallida',
] as const;
export type OptimizationState = (typeof OPTIMIZATION_STATES)[number];

/** Motivos de `optimizacion.motivo`; la interfaz arma el texto desde el código (spec §6). */
export const OPTIMIZATION_REASONS = [
  'tamano',
  'pixeles',
  'animada',
  'ilegible',
  'ahorro_minimo',
  'version_cambiada',
  'archivo_eliminado',
  'integridad',
  'servicio_no_disponible',
] as const;
export type OptimizationReason = (typeof OPTIMIZATION_REASONS)[number];

/** Motivos que admite cada estado; los que no figuran no llevan motivo (`ck_optimizacion_motivo`). */
const REASONS_OF: Partial<Record<OptimizationState, readonly OptimizationReason[]>> = {
  no_disponible: ['tamano', 'pixeles', 'animada', 'ilegible'],
  descartada: ['ahorro_minimo', 'version_cambiada', 'archivo_eliminado'],
  fallida: ['integridad', 'servicio_no_disponible'],
};

/** Estados que todavía esperan al `worker`: solo en ellos la ficha vuelve a consultar (RN-10). */
const IN_PROGRESS: readonly OptimizationState[] = ['estimando', 'optimizando'];

interface StatusShape {
  readonly state: OptimizationState;
  readonly reason: OptimizationReason | null;
  readonly pollAfterMs: number | null;
  readonly keepOriginalDays: number | null;
}

const reasonMatchesState = ({ state, reason }: StatusShape): boolean => {
  const allowed = REASONS_OF[state];
  return allowed === undefined ? reason === null : reason !== null && allowed.includes(reason);
};

const nullableBytes = byteCount.nullable();

/**
 * Estado de la última optimización de un archivo (plan §4). Sin nombres, claves ni URLs. `pollAfterMs` solo mientras
 * está en curso; `keepOriginalDays` solo en `estimada` (fecha del diálogo de confirmación). Ahorro y porcentaje se
 * derivan de los bytes.
 */
export const optimizationStatusSchema = z
  .object({
    id: uuidSchema,
    state: z.enum(OPTIMIZATION_STATES),
    reason: z.enum(OPTIMIZATION_REASONS).nullable(),
    originalBytes: byteCount,
    estimatedBytes: nullableBytes,
    resultBytes: nullableBytes,
    savedBytes: nullableBytes,
    savedPercent: z.number().min(0).max(100).nullable(),
    keepOriginalDays: z.number().int().positive().nullable(),
    pollAfterMs: z.number().int().positive().nullable(),
    updatedAt: timestamp,
  })
  .strict()
  .refine(reasonMatchesState, {
    message:
      'El motivo va solo con `no_disponible`, `descartada` y `fallida`, y siempre uno de su lista',
    path: ['reason'],
  })
  .refine((status) => IN_PROGRESS.includes(status.state) === (status.pollAfterMs !== null), {
    message: '`pollAfterMs` va solo y siempre mientras la optimización está en curso',
    path: ['pollAfterMs'],
  })
  .refine((status) => status.keepOriginalDays === null || status.state === 'estimada', {
    message: '`keepOriginalDays` va solo con `estimada`',
    path: ['keepOriginalDays'],
  });

/** `GET /files/:fileId/optimization`: la última optimización del archivo o `null` si no hay una vigente. */
export const optimizationResponseSchema = z
  .object({ optimization: optimizationStatusSchema.nullable() })
  .strict();

export type OptimizationStatus = z.infer<typeof optimizationStatusSchema>;
export type OptimizationResponse = z.infer<typeof optimizationResponseSchema>;

/** `POST /files/:fileId/optimization/run` confirma una estimación concreta, sin otros parámetros. */
export const runOptimizationBodySchema = z.object({ optimizationId: uuidSchema }).strict();
export type RunOptimizationBody = z.infer<typeof runOptimizationBodySchema>;
