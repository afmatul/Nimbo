import { FixedClock } from './fixed.clock';

describe('FixedClock', () => {
  const fixedAt = new Date('2026-09-15T12:00:00.000Z');

  it('CA-17: `now()` devuelve exactamente la fecha fijada', () => {
    const clock = new FixedClock(fixedAt);

    expect(clock.now().toISOString()).toBe('2026-09-15T12:00:00.000Z');
  });

  it('CA-17: `now()` devuelve una copia; mutarla no altera el reloj', () => {
    const clock = new FixedClock(fixedAt);

    clock.now().setUTCFullYear(1999);

    expect(clock.now().toISOString()).toBe('2026-09-15T12:00:00.000Z');
  });

  it('CA-17: `advance(ms)` desplaza el reloj esa cantidad de milisegundos', () => {
    const clock = new FixedClock(fixedAt);

    clock.advance(90_000);

    expect(clock.now().toISOString()).toBe('2026-09-15T12:01:30.000Z');
  });

  it('CA-17: `set(date)` fija una fecha nueva', () => {
    const clock = new FixedClock(fixedAt);

    clock.set(new Date('2026-10-01T00:00:00.000Z'));

    expect(clock.now().toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });
});
