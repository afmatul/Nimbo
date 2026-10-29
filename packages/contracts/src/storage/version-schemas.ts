import { z } from 'zod';

import { byteCount, timestamp, uuidSchema } from './schema-fields';
import { fileSummarySchema } from './schemas';

/** Esquemas del historial de versiones (spec 014, plan §4). Nunca llevan clave de objeto ni nombres de usuario. */

/** Cómo nació una versión (`version_archivo.origen`, ADR-0012). */
export const FILE_VERSION_ORIGINS = ['carga', 'edicion', 'restauracion', 'optimizacion'] as const;
export type FileVersionOrigin = (typeof FILE_VERSION_ORIGINS)[number];

/** Entero con signo en texto: la diferencia de dos `bigint` puede salir del entero seguro de JavaScript. */
const SIGNED_INTEGER_TEXT = /^-?(0|[1-9]\d*)$/;

const versionNumber = z.number().int().positive();

/**
 * Una versión del historial (CA-6, CA-7). `deltaBytes` es el cambio frente a la anterior retenida, `null` si no la
 * hay; `restoredFromNumber`, el número de la versión de la que se restauró. El autor es solo su id: la web pinta «Tú».
 */
export const fileVersionSummarySchema = z
  .object({
    id: uuidSchema,
    number: versionNumber,
    origin: z.enum(FILE_VERSION_ORIGINS),
    sizeBytes: byteCount.positive(),
    deltaBytes: z.string().regex(SIGNED_INTEGER_TEXT).nullable(),
    restoredFromNumber: versionNumber.nullable(),
    createdAt: timestamp,
    createdById: uuidSchema,
    isCurrent: z.boolean(),
    /** No nulo ⇒ original conservado por una optimización: no cuenta en el espacio y se purga en esa fecha (014b). */
    keptUntil: timestamp.nullable(),
  })
  .strict();

/** El archivo del historial, para el encabezado y los detalles de la ficha (CA-20): nombre, tipo y carpeta. */
export const versionedFileSchema = fileSummarySchema
  .pick({ name: true, kind: true, folderId: true })
  .strict();

/**
 * `GET /files/:fileId/versions`: el archivo, sus versiones de la más nueva a la más antigua, sin paginar, y las
 * retenidas del plan (CA-6).
 */
export const fileVersionsResponseSchema = z
  .object({
    file: versionedFileSchema,
    items: z.array(fileVersionSummarySchema),
    retainedVersions: versionNumber,
  })
  .strict();

export type FileVersionSummary = z.infer<typeof fileVersionSummarySchema>;
export type VersionedFile = z.infer<typeof versionedFileSchema>;
export type FileVersionsResponse = z.infer<typeof fileVersionsResponseSchema>;
