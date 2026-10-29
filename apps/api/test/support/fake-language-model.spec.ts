import { AgentUnavailableError } from '../../src/modules/intelligence/domain/errors';

import { FakeLanguageModel } from './fake-language-model';
import { collectChunks, itBehavesAsLanguageModel } from './language-model.contract';

const PROMPT = { system: 'sistema', user: 'pregunta' };

describe('FakeLanguageModel', () => {
  itBehavesAsLanguageModel((chunks) => new FakeLanguageModel(chunks));

  it('recuerda cada prompt recibido', async () => {
    const model = new FakeLanguageModel(['hola']);

    await collectChunks(model.stream(PROMPT, new AbortController().signal));

    expect(model.prompts).toEqual([PROMPT]);
  });

  it('CA-15: con `failAfter` lanza `AgentUnavailableError` después de esos trozos', async () => {
    const model = new FakeLanguageModel(['uno', 'dos'], { failAfter: 1 });
    const received: string[] = [];

    const consume = async (): Promise<void> => {
      for await (const chunk of model.stream(PROMPT, new AbortController().signal)) {
        received.push(chunk);
      }
    };

    await expect(consume()).rejects.toBeInstanceOf(AgentUnavailableError);
    expect(received).toEqual(['uno']);
  });
});
