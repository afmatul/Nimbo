# ADR-0007 — Modelos de lenguaje y de embeddings detrás de puertos propios (`ILanguageModel`, `IEmbeddingProvider`)

| Campo | Valor |
|---|---|
| Estado | Aceptado |
| Fecha | 2026-10-21 |
| Decisores | Adrián (architect), equipo Nimbo |
| Specs relacionadas | 019 (`IEmbeddingProvider`), 020 (`ILanguageModel`), ADR-0003, ADR-0031, constitución Art. IV (D) y V.2 reglas (a) y (c), RN-9 de la 019 |

## Contexto

El producto usa dos modelos de Google: `gemini-embedding` para vectorizar (019) y Gemini 3.5 Flash para redactar respuestas con
citas (020). El enunciado y la propuesta piden poder sustituir el proveedor (Art. V.2 regla (c)) y la clave del LLM nunca puede
llegar al navegador. Los textos de los clientes salen hacia el proveedor, lo que debe quedar acotado a un único punto de código
(se documenta en la Política de privacidad, 001 D-14). Restricciones: 4 personas, 10 semanas, y las pruebas de integración no
pueden depender de la red ni del cupo del proveedor. La 019 es el primer consumidor; la 020 sumará el modelo de lenguaje.

## Opciones consideradas

1. **Dos puertos propios y pequeños, uno por consumidor**: `IEmbeddingProvider` (`embed(textos) → vectores`, lotes y dimensión
   fija) e `ILanguageModel` (`stream(prompt)`), con una implementación Gemini cada uno y un doble determinista para pruebas.
   - Pros: el dominio y la aplicación de `intelligence` no conocen a Google; los fallos del proveedor se traducen a errores propios
     (`EmbeddingUnavailableError`) y cada puerto tiene su contrato Liskov probado contra el doble; segregación de interfaces (ISP);
     un solo archivo concentra la clave y el envío de texto al exterior.
   - Contras: dos interfaces y un doble por puerto.
2. **Un único puerto `IAiModel` con `embed` y `generate`.**
   - Pros: una interfaz.
   - Contras: dos razones de cambio y dos clientes de pruebas en una sola abstracción; 019 tendría que implementar o simular `generate`
     que no usa (ISP).
3. **Usar el SDK de Google o un marco (Vercel AI SDK, LangChain) directamente en los casos de uso.**
   - Pros: menos código inicial.
   - Contras: dependencia grande en el núcleo, pruebas con mocks del SDK, y cambiar de proveedor toca la aplicación. Descartado por
     Art. IV (D) y por la regla de dependencias grandes (ADR requerido).
4. **Posponer** hasta 020.
   - Contras: 019 ya necesita vectorizar; sin puerto el SDK entra primero y se saca después.

## Decisión

Opción 1. En 019 se implementa solo `IEmbeddingProvider` → `GeminiEmbeddingProvider` (REST, ver ADR-0031) en
`intelligence/infrastructure`, con el puerto declarado en `intelligence/application/ports`. `ILanguageModel` → `GeminiFlashModel` llega
con la 020 y se registra aquí como cumplido. Ambos puertos son **internos** de `intelligence` (nadie más los consume). Reglas:

- Los errores del proveedor (429, 5xx, red, tiempo agotado) se traducen a errores de dominio **reintentables**; clave ausente es un
  error **no reintentable** con motivo propio.
- La clave vive solo en variables de entorno del proceso que llama (`worker` para embeddings) y no aparece en URL, bitácora ni auditoría.
- Un doble determinista (vectores derivados del texto) respalda las pruebas de integración y el aislamiento; la llamada real se prueba
  con un servidor HTTP local y de forma manual con Gemini real.

## Consecuencias

- Positivas: se puede cambiar de modelo sin tocar la aplicación; pruebas sin red; privacidad auditable en un archivo.
- Negativas / deuda aceptada: el contrato de `ILanguageModel` (streaming, citas) se fija con la 020 y puede obligar a retocar este ADR.
- Cómo sabremos si fue un error: si cambiar de proveedor en una prueba de concepto toca más que la clase de infraestructura y su
  módulo, o si el doble deja pasar defectos que la llamada real revela.
