import { z } from 'zod';

import { INTELLIGENCE_ERROR_CODES } from './error-codes';

/**
 * Contratos del agente con citas (spec 020, plan §4): `POST /agent/ask` y `GET /agent/status`. La 020b los consume.
 * No hay historial (RN-10): ningún esquema lleva ids de conversación ni respuestas guardadas.
 */

/** Ámbitos que la petición puede fijar (RN-9); sin `scope`, la pregunta abarca todos los archivos accesibles. */
export const AGENT_SCOPE_TYPES = ['folder', 'file'] as const;
export type AgentScopeType = (typeof AGENT_SCOPE_TYPES)[number];

/** Motivo de `422 AGENT_INVALID_QUESTION` (CA-6): pregunta vacía o más larga que `maxQuestionChars`. */
export const AGENT_INVALID_QUESTION_REASONS = ['empty', 'too_long'] as const;
export type AgentInvalidQuestionReason = (typeof AGENT_INVALID_QUESTION_REASONS)[number];

/** Cómo cierra una respuesta (RN-5): ambas cuentan como consulta. `not_found` es «No encontré esto…» (CA-3). */
export const AGENT_ANSWER_OUTCOMES = ['answered', 'not_found'] as const;
export type AgentAnswerOutcome = (typeof AGENT_ANSWER_OUTCOMES)[number];

const count = () => z.number().int().nonnegative();
const ordinal = () => z.number().int().positive();

/** Carpeta (con sus subcarpetas) o archivo; uno ajeno o inexistente responde `404 AGENT_SCOPE_NOT_FOUND` (CA-17). */
export const agentScopeSchema = z
  .object({ type: z.enum(AGENT_SCOPE_TYPES), id: z.string().uuid() })
  .strict();

/**
 * Cuerpo de `POST /agent/ask`. La pregunta no se acota aquí: vacía o larga la rechaza el servidor con `422` y su
 * motivo (CA-6), porque el máximo es configurable por entorno (RN-7) y lo informa `GET /agent/status`.
 */
export const agentAskRequestSchema = z
  .object({ question: z.string(), scope: agentScopeSchema.optional() })
  .strict();

/** `details` de `422 AGENT_INVALID_QUESTION` (CA-6). */
export const agentInvalidQuestionDetailsSchema = z
  .object({ reason: z.enum(AGENT_INVALID_QUESTION_REASONS) })
  .strict();

/**
 * `details` de `429 AGENT_QUOTA_EXCEEDED` (CA-11). `resetsAt` falta cuando el contador no se renueva solo (cuenta en
 * solo lectura, P-9): `details` no admite `null` (`errorResponseSchema`).
 */
export const agentQuotaExceededDetailsSchema = z
  .object({ limit: count(), resetsAt: z.string().datetime().optional() })
  .strict();

/**
 * `GET /agent/status` (CA-7, CA-10, S-3). `resetsAt` es `null` si el periodo venció y no se reinicia hasta pagar
 * (P-9). `maxQuestionChars` evita que la web copie el máximo (RN-7).
 */
export const agentStatusSchema = z
  .object({
    used: count(),
    limit: count(),
    resetsAt: z.string().datetime().nullable(),
    hasIndexedFiles: z.boolean(),
    maxQuestionChars: ordinal(),
  })
  .strict();

/**
 * Cita validada por el servidor (CA-1, RN-6): llega una vez por ordinal, antes del `delta` que menciona `[n]`. La
 * etiqueta ya dice «(ubicación aproximada)» cuando `isCertain` es falso (CA-4). Nunca lleva texto del fragmento.
 */
export const agentCitationEventSchema = z
  .object({
    type: z.literal('citation'),
    ordinal: ordinal(),
    fileId: z.string().uuid(),
    versionId: z.string().uuid(),
    fileName: z.string().min(1),
    label: z.string().min(1),
    isCertain: z.boolean(),
  })
  .strict();

/** Trozo de la respuesta en español, con las marcas `[n]` de sus citas (CA-1). */
export const agentDeltaEventSchema = z
  .object({ type: z.literal('delta'), text: z.string().min(1) })
  .strict();

/** Fin de la respuesta con el contador ya actualizado (RN-5). */
export const agentDoneEventSchema = z
  .object({
    type: z.literal('done'),
    outcome: z.enum(AGENT_ANSWER_OUTCOMES),
    used: count(),
    limit: count(),
  })
  .strict();

/** El proveedor falló con texto ya enviado (CA-15): la consulta no se descuenta. Antes del primer evento es un 503. */
export const agentErrorEventSchema = z
  .object({ type: z.literal('error'), code: z.literal(INTELLIGENCE_ERROR_CODES.AGENT_UNAVAILABLE) })
  .strict();

/** Cada marco `data:` del `text/event-stream` de `POST /agent/ask` es uno de estos JSON (plan 020 §4, D-6). */
export const agentEventSchema = z.discriminatedUnion('type', [
  agentCitationEventSchema,
  agentDeltaEventSchema,
  agentDoneEventSchema,
  agentErrorEventSchema,
]);

export type AgentScopeRequest = z.infer<typeof agentScopeSchema>;
export type AgentAskRequest = z.infer<typeof agentAskRequestSchema>;
export type AgentInvalidQuestionDetails = z.infer<typeof agentInvalidQuestionDetailsSchema>;
export type AgentQuotaExceededDetails = z.infer<typeof agentQuotaExceededDetailsSchema>;
export type AgentStatusResponse = z.infer<typeof agentStatusSchema>;
export type AgentCitationEvent = z.infer<typeof agentCitationEventSchema>;
export type AgentDeltaEvent = z.infer<typeof agentDeltaEventSchema>;
export type AgentDoneEvent = z.infer<typeof agentDoneEventSchema>;
export type AgentErrorEvent = z.infer<typeof agentErrorEventSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;
