import { Inject, Injectable } from '@nestjs/common';

import { I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, ITransactionRunner } from '../../../shared';
import { NodeNotFoundError } from '../domain/errors';
import type { FileVersion } from '../domain/file-version';
import { VersionHistory } from '../domain/version-history';
import type { VersionEntry } from '../domain/version-history';

import { I_PLAN_LIMITS_PROVIDER } from './plan-limits';
import type { IPlanLimitsProvider } from './plan-limits';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';
import { I_VERSION_REPOSITORY } from './ports/i-version.repository.port';
import type { IVersionRepository } from './ports/i-version.repository.port';

/** Historial de un archivo (CA-6): sus versiones retenidas, cuál es la actual y cuántas conserva el plan. */
export interface FileVersionHistory {
  readonly entries: readonly VersionEntry[];
  readonly currentVersionId: string;
  readonly retainedVersions: number;
}

interface FileVersions {
  readonly currentVersionId: string;
  readonly versions: readonly FileVersion[];
}

/**
 * Lectura del historial (plan 014 §2, RF-29). El archivo se resuelve con `findAccessibleById` (`accessibleNodes`)
 * **antes** de leer versiones, en la misma transacción con actor: ajeno, inexistente o en la papelera es el mismo
 * `NodeNotFoundError` (CA-16). Las retenidas salen del plan vía `IPlanLimitsProvider` (sin números mágicos).
 */
@Injectable()
export class VersionHistoryService {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_VERSION_REPOSITORY) private readonly versions: IVersionRepository,
    @Inject(I_PLAN_LIMITS_PROVIDER) private readonly planLimits: IPlanLimitsProvider,
  ) {}

  async list(actor: Actor, fileId: string): Promise<FileVersionHistory> {
    const { currentVersionId, versions } = await this.transactions.withActor(actor, () =>
      this.readVersions(actor, fileId),
    );
    const { retainedVersions } = await this.planLimits.limitsFor(actor);
    return { entries: VersionHistory.of(versions), currentVersionId, retainedVersions };
  }

  private async readVersions(actor: Actor, fileId: string): Promise<FileVersions> {
    const file = await this.nodes.findAccessibleById(actor, fileId);
    if (file === null) throw new NodeNotFoundError();
    const versions = await this.versions.list(actor, file.id);
    return { currentVersionId: file.currentVersionId, versions };
  }
}
