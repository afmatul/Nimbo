import { fileSummarySchema } from '@nimbo/contracts';

import { ZodValidationPipe } from '../../../../shared';
import { NodeNotFoundError } from '../../domain/errors';

export const previewFileIdPipe = (): ZodValidationPipe<string> =>
  new ZodValidationPipe(fileSummarySchema.shape.id, () => new NodeNotFoundError());
