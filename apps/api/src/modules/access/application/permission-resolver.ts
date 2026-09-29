import { Inject, Injectable } from '@nestjs/common';

import type { Actor } from '../../../shared';
import type { AccessLevel } from '../domain/access-level.enum';
import type { Action } from '../domain/action.enum';
import { policyFor } from '../domain/policies/access-policies';

import { I_ACCESS_LEVEL_READER } from './i-access-level-reader.port';
import type { IAccessLevelReader } from './i-access-level-reader.port';

/** UUID en su forma canónica: cualquier otro `nodeId` no identifica un nodo y no llega a la consulta. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Decide qué puede hacer un actor sobre un nodo (M3a, plan 003 §6.5). Los roles internos nunca tienen acceso a
 * contenido (CA-9, Art. IX.1): se niega sin consultar. Debe llamarse dentro de `withActor(actor, …)`.
 */
@Injectable()
export class PermissionResolver {
  constructor(@Inject(I_ACCESS_LEVEL_READER) private readonly reader: IAccessLevelReader) {}

  async levelFor(actor: Actor, nodeId: string): Promise<AccessLevel | null> {
    if (!actor.canReadContent || !UUID_PATTERN.test(nodeId)) {
      return null;
    }
    return this.reader.levelFor(actor, nodeId);
  }

  async can(actor: Actor, nodeId: string, action: Action): Promise<boolean> {
    const level = await this.levelFor(actor, nodeId);
    return level !== null && policyFor(level).allows(action);
  }
}
