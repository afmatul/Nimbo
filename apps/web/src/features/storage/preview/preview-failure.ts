import { SHARED_ERROR_CODES, STORAGE_ERROR_CODES } from '@nimbo/contracts';

import { ApiClientError } from '../../../lib/api-error';

export type PreviewFailureReason =
  | 'not-found'
  | 'unsupported'
  | 'rate-limited'
  | 'network'
  | 'unexpected'
  | 'forbidden'
  | 'unauthenticated'
  | 'protected'
  | 'corrupt'
  | 'unavailable'
  | 'expired'
  | 'memory';

export type PreviewFailure = {
  readonly reason: PreviewFailureReason;
  readonly correlationId: string;
};

const API_REASONS: Readonly<Record<string, PreviewFailureReason>> = {
  [STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND]: 'not-found',
  [STORAGE_ERROR_CODES.STORAGE_PREVIEW_UNSUPPORTED]: 'unsupported',
  [STORAGE_ERROR_CODES.STORAGE_TOO_MANY_REQUESTS]: 'rate-limited',
  [SHARED_ERROR_CODES.FORBIDDEN]: 'forbidden',
  [SHARED_ERROR_CODES.UNAUTHENTICATED]: 'unauthenticated',
};

/** Solo metadata pública cerrada; no transportar la excepción ni sus detalles privados. */
export function classifyPreviewFailure(caught: unknown): PreviewFailure {
  if (!(caught instanceof ApiClientError)) return { reason: 'unexpected', correlationId: '' };
  const apiReason = Object.prototype.hasOwnProperty.call(API_REASONS, caught.code)
    ? API_REASONS[caught.code]
    : undefined;
  return {
    reason: caught.status === undefined ? 'network' : (apiReason ?? 'unexpected'),
    correlationId: /^[\w-]+$/.test(caught.correlationId) ? caught.correlationId : '',
  };
}
