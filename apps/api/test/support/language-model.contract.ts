import type { ILanguageModel } from '../../src/modules/intelligence/application/ports/i-language-model.port';

/**
 * Contrato de `ILanguageModel` (Liskov, 020 T-03): lo cumplen `GeminiFlashModel` (con `fetch` simulado que responde
 * un SSE de Gemini) y el doble `FakeLanguageModel`, para que el doble no prometa lo que el real no da. `answering`
 * construye un modelo que responderá exactamente esos trozos.
 */
export type LanguageModelFactory = (chunks: readonly string[]) => ILanguageModel;

const PROMPT = { system: 'Responde solo con los fragmentos.', user: '¿Cuándo vence el contrato?' };

/** Consume el flujo entero y devuelve sus trozos (también lo usan las pruebas propias de cada implementación). */
export async function collectChunks(stream: AsyncIterable<string>): Promise<string[]> {
  const received: string[] = [];
  for await (const chunk of stream) received.push(chunk);
  return received;
}

export function itBehavesAsLanguageModel(answering: LanguageModelFactory): void {
  it('contrato: entrega los trozos de la respuesta en orden', async () => {
    const chunks = ['El contrato ', 'vence el 31 de marzo ', '[1].'];

    const received = await collectChunks(
      answering(chunks).stream(PROMPT, new AbortController().signal),
    );

    expect(received).toEqual(chunks);
  });

  it('contrato: una respuesta sin texto termina sin trozos', async () => {
    const received = await collectChunks(
      answering([]).stream(PROMPT, new AbortController().signal),
    );

    expect(received).toEqual([]);
  });

  it('contrato: cancelar deja de entregar trozos y lanza el motivo de la cancelación', async () => {
    const controller = new AbortController();
    const reason = new Error('la persona cerró el panel');
    const received: string[] = [];

    const consume = async (): Promise<void> => {
      for await (const chunk of answering(['uno', 'dos', 'tres']).stream(
        PROMPT,
        controller.signal,
      )) {
        received.push(chunk);
        controller.abort(reason);
      }
    };

    await expect(consume()).rejects.toBe(reason);
    expect(received).toEqual(['uno']);
  });
}
