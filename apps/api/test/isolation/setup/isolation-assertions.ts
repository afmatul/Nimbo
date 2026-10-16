import type { Response } from 'supertest';

import { Role } from '../../../src/shared';

import type { InternalRole } from './isolation-world';

/** Los roles internos: ninguno llega a datos de cliente (RF-05, RNF-05). */
export const INTERNAL_ROLES: readonly InternalRole[] = [Role.ADMIN, Role.SUPPORT, Role.OPERATOR];

export interface ComparableResponse {
  readonly status: number;
  readonly contentType: string | undefined;
  readonly body: Record<string, unknown>;
}

/** Lo que un cliente distingue de una respuesta: todo menos el `correlationId` (003 CA-11). */
export const comparable = (response: Response): ComparableResponse => {
  const { correlationId: _ignored, ...body } = response.body as Record<string, unknown>;
  return { status: response.status, contentType: response.headers['content-type'], body };
};
