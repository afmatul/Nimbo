import type {
  ILanguageModel,
  LanguageModelPrompt,
} from '../../src/modules/intelligence/application/ports/i-language-model.port';
import { AgentUnavailableError } from '../../src/modules/intelligence/domain/errors';

/** `failAfter`: entrega esos trozos y luego falla como un proveedor caído a mitad del flujo (CA-15). */
export interface FakeLanguageModelOptions {
  readonly failAfter?: number;
}

/**
 * Doble determinista de `ILanguageModel` (ADR-0007): responde los trozos dados, sin red. `prompts` recuerda lo que
 * recibió para comprobar qué llega al proveedor (S-1). Cumple el contrato de `language-model.contract.ts`.
 */
export class FakeLanguageModel implements ILanguageModel {
  readonly prompts: LanguageModelPrompt[] = [];

  constructor(
    private readonly chunks: readonly string[],
    private readonly options: FakeLanguageModelOptions = {},
  ) {}

  async *stream(prompt: LanguageModelPrompt, signal: AbortSignal): AsyncGenerator<string> {
    this.prompts.push(prompt);
    for (const [index, chunk] of this.chunks.entries()) {
      await Promise.resolve();
      signal.throwIfAborted();
      if (index === this.options.failAfter) throw new AgentUnavailableError();
      yield chunk;
    }
    if (this.chunks.length === this.options.failAfter) throw new AgentUnavailableError();
  }
}
