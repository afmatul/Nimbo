import { SHARING_ERROR_CODES } from '@nimbo/contracts';

import { ApiClientError } from '../../../lib/api-error';

/** El rechazo de la API trae ese `code` (013b): lo comparten la ficha y la descarga del enlace público. */
export const hasCode = (error: unknown, code: string): error is ApiClientError =>
  error instanceof ApiClientError && error.code === code;

/** `404` del enlace: revocado, vencido o inexistente se ven igual (CA-6). */
export const isUnavailable = (error: unknown): boolean =>
  hasCode(error, SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE);
