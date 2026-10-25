/**
 * Lo común entre `GeminiEmbeddingProvider` y `GeminiFlashModel` (020 D-7): la base de la API REST y el `POST` con la
 * clave. No es un cliente genérico: cada adaptador arma su cuerpo, lee su respuesta y traduce sus errores. La clave va
 * solo en la cabecera `x-goog-api-key`: nunca en la URL, en un error ni en bitácora (ADR-0033 c).
 */

/** Base de la API REST de Gemini; las pruebas la apuntan a un servidor local o a un `fetch` simulado. */
export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Petición a un método de un modelo (`batchEmbedContents`, `streamGenerateContent?alt=sse`…). */
export interface GeminiRequest {
  readonly baseUrl: string;
  readonly model: string;
  readonly method: string;
  readonly apiKey: string;
  readonly body: unknown;
}

function modelUrl(request: GeminiRequest): string {
  return `${request.baseUrl}/models/${encodeURIComponent(request.model)}:${request.method}`;
}

/** `POST` JSON sin seguir redirecciones (la clave no viaja a otro origen). Los errores de red se propagan tal cual. */
export function postToGemini(request: GeminiRequest, signal: AbortSignal): Promise<Response> {
  return fetch(modelUrl(request), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': request.apiKey },
    body: JSON.stringify(request.body),
    signal,
    redirect: 'error',
  });
}
