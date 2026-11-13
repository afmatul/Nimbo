import { acquireThumbnailSlot } from './thumbnail-queue';

const never = new AbortController().signal;

describe('acquireThumbnailSlot', () => {
  it('deja leer 3 miniaturas a la vez y da el turno a la siguiente al liberar', async () => {
    const first = await Promise.all([1, 2, 3].map(() => acquireThumbnailSlot(never)));
    let fourthStarted = false;
    const fourth = acquireThumbnailSlot(never).then((release) => {
      fourthStarted = true;
      return release;
    });
    await Promise.resolve();
    expect(fourthStarted).toBe(false);

    first[0]?.();
    const release = await fourth;
    expect(fourthStarted).toBe(true);
    first.slice(1).forEach((free) => free?.());
    release?.();
  });

  it('una espera cancelada no ocupa turno', async () => {
    const holders = await Promise.all([1, 2, 3].map(() => acquireThumbnailSlot(never)));
    const controller = new AbortController();
    const waiting = acquireThumbnailSlot(controller.signal);
    controller.abort();
    expect(await waiting).toBeNull();
    holders.forEach((free) => free?.());
  });
});
