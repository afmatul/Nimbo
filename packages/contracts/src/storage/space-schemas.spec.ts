import { spaceSummaryResponseSchema } from './space-schemas';

const SUMMARY = {
  planName: 'Personal',
  usedBytes: 1_200_000_000,
  reservedBytes: 50_000_000,
  quotaBytes: 5_000_000_000,
  availableBytes: 3_750_000_000,
  maxFileBytes: 100_000_000,
  trashRetentionDays: 30,
  breakdown: {
    documentsBytes: 700_000_000,
    imagesBytes: 300_000_000,
    otherBytes: 100_000_000,
    trashBytes: 100_000_000,
  },
};

describe('spaceSummaryResponseSchema (007 plan §4)', () => {
  it('CA-1, CA-6: el resumen lleva plan, usado, reservado, cuota, disponible, máximo por archivo, retención y desglose', () => {
    expect(spaceSummaryResponseSchema.parse(SUMMARY)).toEqual(SUMMARY);
  });

  it('CA-1: un espacio vacío (todo en cero salvo cuota, máximo y retención) es válido', () => {
    const empty = {
      ...SUMMARY,
      usedBytes: 0,
      reservedBytes: 0,
      availableBytes: SUMMARY.quotaBytes,
      breakdown: { documentsBytes: 0, imagesBytes: 0, otherBytes: 0, trashBytes: 0 },
    };

    expect(spaceSummaryResponseSchema.parse(empty)).toEqual(empty);
  });

  it.each([
    ['bytes negativos', { ...SUMMARY, usedBytes: -1 }],
    ['bytes fraccionarios', { ...SUMMARY, availableBytes: 1.5 }],
    ['bytes fuera del entero seguro', { ...SUMMARY, quotaBytes: Number.MAX_SAFE_INTEGER + 2 }],
    ['bytes como texto', { ...SUMMARY, maxFileBytes: '100' }],
    ['sin nombre de plan', { ...SUMMARY, planName: '' }],
    ['retención en cero', { ...SUMMARY, trashRetentionDays: 0 }],
    ['campo de más', { ...SUMMARY, upgradeOffer: true }],
    [
      'desglose con campo de más',
      { ...SUMMARY, breakdown: { ...SUMMARY.breakdown, videoBytes: 1 } },
    ],
    ['desglose incompleto', { ...SUMMARY, breakdown: { documentsBytes: 1 } }],
  ])('CA-1: rechaza %s', (_, input) => {
    expect(spaceSummaryResponseSchema.safeParse(input).success).toBe(false);
  });
});
