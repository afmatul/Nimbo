import { saveChosenPlan, takeChosenPlan } from './chosen-plan-storage';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length(): number {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('chosen-plan-storage', () => {
  const now = new Date('2026-09-28T12:00:00.000Z');

  it('guarda planId, planName y savedAt, sin correo ni nombre', () => {
    const storage = memoryStorage();
    saveChosenPlan(storage, { planId: 'pro', planName: 'Profesional' }, now);

    const stored = JSON.parse(storage.getItem('nimbo.registro.plan') ?? '') as Record<
      string,
      unknown
    >;
    expect(Object.keys(stored).sort()).toEqual(['planId', 'planName', 'savedAt']);
  });

  it('se lee solo si tiene menos de 24 h y se borra al leer', () => {
    const storage = memoryStorage();
    saveChosenPlan(storage, { planId: 'pro', planName: 'Profesional' }, now);

    expect(takeChosenPlan(storage, new Date(now.getTime() + 24 * 60 * 60 * 1000 - 1))).toEqual({
      planId: 'pro',
      planName: 'Profesional',
    });
    expect(storage.getItem('nimbo.registro.plan')).toBeNull();
    expect(takeChosenPlan(storage, now)).toBeNull();
  });

  it('descarta un plan con 24 h o más', () => {
    const storage = memoryStorage();
    saveChosenPlan(storage, { planId: 'pro', planName: 'Profesional' }, now);

    expect(takeChosenPlan(storage, new Date(now.getTime() + 24 * 60 * 60 * 1000))).toBeNull();
  });

  it('sin almacenamiento devuelve null', () => {
    expect(takeChosenPlan(undefined, now)).toBeNull();
    expect(() =>
      saveChosenPlan(undefined, { planId: 'pro', planName: 'Profesional' }, now),
    ).not.toThrow();
  });
});
