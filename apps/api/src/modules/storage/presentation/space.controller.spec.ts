import { spaceSummaryResponseSchema } from '@nimbo/contracts';

import { createActor, Role } from '../../../shared';
import type { SpaceSummary, SpaceSummaryService } from '../application/space-summary.service';
import { SpaceBreakdown } from '../domain/space-breakdown';

import { SpaceController } from './space.controller';

const ANA = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const SUMMARY: SpaceSummary = {
  planName: 'Plan de prueba',
  usedBytes: 600n,
  reservedBytes: 20n,
  quotaBytes: 1000n,
  baseQuotaBytes: 800n,
  extraQuotaBytes: 200n,
  extraQuotaUntil: new Date('2026-11-16T06:00:00.000Z'),
  availableBytes: 380n,
  maxFileBytes: 100n,
  trashRetentionDays: 30,
  readOnly: false,
  breakdown: SpaceBreakdown.fromBytesByKind(
    new Map([
      ['docx', 300n],
      ['imagen', 200n],
      ['otro', 50n],
    ]),
    50n,
  ),
};

describe('SpaceController', () => {
  it('CA-1, CA-6, D-4, 011b CA-5: delega con el actor y responde el esquema del resumen con bytes como enteros', async () => {
    const summary = jest.fn((_actor: unknown) => Promise.resolve(SUMMARY));
    const controller = new SpaceController({ summary } as unknown as SpaceSummaryService);

    const response = await controller.summary(ANA);

    expect(summary).toHaveBeenCalledWith(ANA);
    expect(spaceSummaryResponseSchema.parse(response)).toEqual({
      planName: 'Plan de prueba',
      usedBytes: 600,
      reservedBytes: 20,
      quotaBytes: 1000,
      baseQuotaBytes: 800,
      extraQuotaBytes: 200,
      extraQuotaUntil: '2026-11-16T06:00:00.000Z',
      availableBytes: 380,
      maxFileBytes: 100,
      trashRetentionDays: 30,
      readOnly: false,
      breakdown: { documentsBytes: 300, imagesBytes: 200, otherBytes: 50, trashBytes: 50 },
    });
  });
});
