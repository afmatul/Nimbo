import { fileSummarySchema } from '@nimbo/contracts';

import { NodeNotFoundError } from '../..';
import { ZodValidationPipe } from '../../../../shared';

export const previewFileIdPipe = (): ZodValidationPipe<string> =>
  new ZodValidationPipe(fileSummarySchema.shape.id, () => new NodeNotFoundError());
