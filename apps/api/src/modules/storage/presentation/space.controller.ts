import { Controller, Get } from '@nestjs/common';
import type { SpaceSummaryResponse } from '@nimbo/contracts';

import { CurrentActor, Role, Roles } from '../../../shared';
import type { Actor } from '../../../shared';
import { SpaceSummaryService } from '../application/space-summary.service';
import type { SpaceSummary } from '../application/space-summary.service';

/** Bytes como enteros seguros en JSON (D-4). */
const toSpaceSummaryResponse = ({ breakdown, ...summary }: SpaceSummary): SpaceSummaryResponse => ({
  planName: summary.planName,
  usedBytes: Number(summary.usedBytes),
  reservedBytes: Number(summary.reservedBytes),
  quotaBytes: Number(summary.quotaBytes),
  availableBytes: Number(summary.availableBytes),
  maxFileBytes: Number(summary.maxFileBytes),
  trashRetentionDays: summary.trashRetentionDays,
  readOnly: summary.readOnly,
  breakdown: {
    documentsBytes: Number(breakdown.documentsBytes),
    imagesBytes: Number(breakdown.imagesBytes),
    otherBytes: Number(breakdown.otherBytes),
    trashBytes: Number(breakdown.trashBytes),
  },
});

/** Resumen de espacio de la cuenta (spec 007 CA-1 a CA-6). Solo `CLIENT` (CA-17): rol interno 403, sin token 401. */
@Roles(Role.CLIENT)
@Controller('storage')
export class SpaceController {
  constructor(private readonly spaces: SpaceSummaryService) {}

  @Get('summary')
  async summary(@CurrentActor() actor: Actor): Promise<SpaceSummaryResponse> {
    return toSpaceSummaryResponse(await this.spaces.summary(actor));
  }
}
