import {
  FIRST_FRAGMENT_BUDGET_MS,
  meetsFirstFragmentBudget,
  percentile,
  proposeMinSimilarity,
  proposeTimeoutMs,
} from './agent-measure-stats';

const TWENTY_SAMPLES = Array.from({ length: 20 }, (_value, index) => (index + 1) * 100);

describe('percentile (rango más cercano)', () => {
  it('CA-2: el p95 de 20 muestras es la 19.ª ordenada, sin importar el orden de llegada', () => {
    const shuffled = [...TWENTY_SAMPLES].reverse();

    expect(percentile(shuffled, 0.95)).toBe(1900);
  });

  it('con una sola muestra devuelve esa muestra', () => {
    expect(percentile([742], 0.95)).toBe(742);
  });

  it('sin muestras no inventa un valor', () => {
    expect(percentile([], 0.95)).toBeUndefined();
  });

  it('no modifica el arreglo recibido', () => {
    const samples = [300, 100, 200];

    percentile(samples, 0.5);

    expect(samples).toEqual([300, 100, 200]);
  });
});

describe('meetsFirstFragmentBudget', () => {
  it('CA-2: cumple con 20 preguntas medidas y p95 bajo el presupuesto de 3 s', () => {
    expect(FIRST_FRAGMENT_BUDGET_MS).toBe(3000);
    expect(meetsFirstFragmentBudget(TWENTY_SAMPLES, 20)).toBe(true);
  });

  it('CA-2: no cumple si el p95 llega al presupuesto', () => {
    const slow = [...TWENTY_SAMPLES.slice(0, 18), FIRST_FRAGMENT_BUDGET_MS, 4000];

    expect(meetsFirstFragmentBudget(slow, 20)).toBe(false);
  });

  it('CA-2: no cumple si faltan preguntas medidas (alguna no llegó al modelo o falló)', () => {
    expect(meetsFirstFragmentBudget(TWENTY_SAMPLES.slice(0, 19), 20)).toBe(false);
  });
});

describe('proposeMinSimilarity', () => {
  it('CA-3: propone el punto medio, a dos decimales, si las preguntas con respuesta superan a las sin respuesta', () => {
    const proposal = proposeMinSimilarity({
      answerable: [0.71, 0.66, 0.8],
      unanswerable: [0.41, 0.52, 0.47],
    });

    expect(proposal).toEqual({
      separated: true,
      value: 0.59,
      answerableMin: 0.66,
      unanswerableMax: 0.52,
    });
  });

  it('CA-3: si los rangos se cruzan no propone valor (se ajusta en la revisión de T-10, plan §7)', () => {
    const proposal = proposeMinSimilarity({ answerable: [0.6, 0.7], unanswerable: [0.65] });

    expect(proposal).toEqual({ separated: false, answerableMin: 0.6, unanswerableMax: 0.65 });
  });

  it('CA-3: si falta alguna de las dos series no propone valor', () => {
    expect(proposeMinSimilarity({ answerable: [0.7], unanswerable: [] })).toEqual({
      separated: false,
      answerableMin: 0.7,
      unanswerableMax: undefined,
    });
  });
});

describe('proposeTimeoutMs', () => {
  it('propone el doble del p95, redondeado hacia arriba al segundo', () => {
    expect(proposeTimeoutMs(TWENTY_SAMPLES)).toBe(4000);
  });

  it('un p95 exacto en segundos no se redondea de más', () => {
    expect(proposeTimeoutMs([1500])).toBe(3000);
  });

  it('sin muestras no propone plazo', () => {
    expect(proposeTimeoutMs([])).toBeUndefined();
  });
});
