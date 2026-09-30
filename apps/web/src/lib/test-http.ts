/** Respuesta mínima para simular `fetch` en pruebas con jsdom (sin `Response` nativo). */
export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

/** Cuerpo de error de la API (000 §10). */
export function errorResponse(
  code: string,
  status: number,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return jsonResponse({ code, message: code, correlationId: 'corr-prueba' }, status, headers);
}
