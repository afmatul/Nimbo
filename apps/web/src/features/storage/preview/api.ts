import { previewUrlResponseSchema, type PreviewUrlResponse } from '@nimbo/contracts';

import { ApiClientError, genericErrorMessage } from '../../../lib/api-error';
import type { AuthFetch } from '../../identity/session/auth-fetch';

export type PreviewUrlRequest = { readonly fileId: string; readonly signal?: AbortSignal };
export type PreviewUrlRequester = (
  fileId: string,
  signal: AbortSignal,
) => Promise<PreviewUrlResponse>;

export async function requestPreviewUrl(
  apiPublicUrl: string,
  authFetch: AuthFetch,
  request: PreviewUrlRequest,
): Promise<PreviewUrlResponse> {
  const base = apiPublicUrl.replace(/\/$/, '');
  const raw = await authFetch(`${base}/files/${encodeURIComponent(request.fileId)}/preview-url`, {
    method: 'POST',
    ...(request.signal === undefined ? {} : { signal: request.signal }),
  });
  const parsed = previewUrlResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiClientError({
      code: 'INTERNAL_ERROR',
      message: genericErrorMessage(''),
      correlationId: '',
      status: 500,
    });
  }
  return parsed.data;
}
