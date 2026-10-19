import { randomUUID } from 'node:crypto';

import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import {
  FakeAuditLogger,
  FakeNodeRepository,
  FakeObjectStorage,
  FakeQuotaRepository,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { FakeVersionRepository, seedVersionedFile } from '../../../../test/support/version-fakes';
import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import type { File } from '../domain/file';
import { FileVersion } from '../domain/file-version';
import type { FileVersionOrigin, NewVersionInput } from '../domain/file-version';
import { ObjectKey } from '../domain/object-key';

import { FileVersionService } from './file-version.service';
import type { RegisterVersionCommand } from './file-version.service';
import { VersionPruner } from './version-pruner';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const NOW = new Date('2026-10-08T10:00:00.000Z');
const NEW_BYTES = 500n;
const LIMITS = {
  planName: 'Plan de prueba',
  maxFileBytes: 1_000_000n,
  storageQuotaBytes: 10_000_000n,
  trashRetentionDays: 30,
  retainedVersions: 3,
  maxEditors: 0,
};

function setup() {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const quotas = new FakeQuotaRepository(journal, transactions.locks);
  const nodes = new FakeNodeRepository(journal);
  const versions = new FakeVersionRepository(journal);
  const objects = new FakeObjectStorage(journal);
  const audit = new FakeAuditLogger(journal);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const pruner = new VersionPruner(
    transactions,
    nodes,
    versions,
    quotas,
    objects,
    new FakePlanLimitsProvider(LIMITS),
    audit,
    logger,
  );
  const service = new FileVersionService(quotas, versions, nodes, pruner, logger);
  const file = seedVersionedFile({ nodes, versions, objects }, ANA, [100n, 200n, 300n]);
  return { journal, transactions, quotas, nodes, versions, objects, audit, logger, service, file };
}

/** Cómo arma su versión cada camino que registra (CA-5): el servicio solo le da el número. */
const builders: Record<FileVersionOrigin, (file: File) => RegisterVersionCommand['buildVersion']> =
  {
    carga: (file) => (number) => {
      const id = randomUUID();
      return FileVersion.fromUpload({
        id,
        fileId: file.id,
        objectKey: ObjectKey.of(ANA.id, file.id, id),
        sizeBytes: NEW_BYTES,
        createdBy: ANA.id,
        number,
        now: NOW,
      });
    },
    restauracion: (file) => (number) => {
      const id = randomUUID();
      const source = FileVersion.fromUpload({
        id: randomUUID(),
        fileId: file.id,
        objectKey: ObjectKey.of(ANA.id, file.id, randomUUID()),
        sizeBytes: NEW_BYTES,
        createdBy: ANA.id,
        number: 1,
        now: NOW,
      });
      const objectKey = ObjectKey.of(ANA.id, file.id, id);
      return FileVersion.fromRestoration(source, {
        id,
        objectKey,
        createdBy: ANA.id,
        number,
        now: NOW,
      });
    },
    edicion: (file) => (number) =>
      FileVersion.fromEdit({ ...generated(file, number), editSessionId: randomUUID() }),
    optimizacion: (file) => (number) =>
      FileVersion.forOrigin('optimizacion', generated(file, number)),
  };

/** Lo que registran 016 y 021: el mismo `register` con otro origen (OCP). */
function generated(file: File, number: number): NewVersionInput {
  const id = randomUUID();
  return {
    id,
    fileId: file.id,
    objectKey: ObjectKey.of(ANA.id, file.id, id),
    sizeBytes: NEW_BYTES,
    createdBy: ANA.id,
    number,
    now: NOW,
  };
}

describe('FileVersionService (plan 014 §1, CA-4, CA-5, CA-13)', () => {
  it.each(['carga', 'restauracion', 'edicion', 'optimizacion'] as const)(
    'CA-5, CA-4: `%s` se registra con la misma numeración, puntero y cuota, en la transacción del llamador',
    async (origin) => {
      const { service, transactions, journal, quotas, nodes, versions, file } = setup();

      const registered = await transactions.withActor(ANA, () =>
        service.register(ANA, { file, buildVersion: builders[origin](file) }),
      );

      expect(registered.version.origin).toBe(origin);
      expect(registered.version.number).toBe(4);
      expect(registered.file.currentVersionId).toBe(registered.version.id);
      expect(registered.file.sizeBytes).toBe(NEW_BYTES);
      expect(nodes.files.get(file.id)).toBe(registered.file);
      expect(versions.numbersOf(file.id)).toEqual([1, 2, 3, 4]);
      expect(quotas.added).toEqual([NEW_BYTES]);
      expect(journal.entries).toEqual([
        'tx:begin',
        'quota:lockUsage',
        'versions:nextNumber',
        'versions:insert:4',
        'nodes:updateCurrentVersion',
        'quota:addUsedBytes',
        'tx:end',
      ]);
    },
  );

  it.each(['carga', 'restauracion', 'edicion'] as const)(
    'CA-5, CA-13: tras el commit de `%s`, `afterCommit` aplica la misma retención (sin auditar ni publicar más)',
    async (origin) => {
      const { service, transactions, quotas, versions, audit, file } = setup();
      await transactions.withActor(ANA, () =>
        service.register(ANA, { file, buildVersion: builders[origin](file) }),
      );

      await service.afterCommit(ANA, file.id);

      expect(versions.numbersOf(file.id)).toEqual([2, 3, 4]);
      expect(quotas.added).toEqual([NEW_BYTES, -100n]);
      expect(audit.records.map((record) => record.action)).toEqual(['file.version_pruned']);
    },
  );

  it('CA-4: dos registros seguidos del mismo archivo toman números consecutivos distintos', async () => {
    const { service, transactions, versions, nodes, file } = setup();

    const first = await transactions.withActor(ANA, () =>
      service.register(ANA, { file, buildVersion: builders.edicion(file) }),
    );
    const second = await transactions.withActor(ANA, () =>
      service.register(ANA, { file: first.file, buildVersion: builders.edicion(file) }),
    );

    expect([first.version.number, second.version.number]).toEqual([4, 5]);
    expect(nodes.files.get(file.id)?.currentVersionId).toBe(second.version.id);
    expect(versions.numbersOf(file.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('CA-19: la bitácora técnica lleva solo UUID, número y origen', async () => {
    const { service, transactions, logger, file } = setup();

    const { version } = await transactions.withActor(ANA, () =>
      service.register(ANA, { file, buildVersion: builders.carga(file) }),
    );

    expect(logger.info).toHaveBeenCalledWith({
      event: 'version.registered',
      fileId: file.id,
      versionId: version.id,
      versionNumber: 4,
      origin: 'carga',
    });
  });

  it('`afterCommit` nunca falla al llamador aunque la poda falle', async () => {
    const { service, transactions, objects, versions, file } = setup();
    await transactions.withActor(ANA, () =>
      service.register(ANA, { file, buildVersion: builders.carga(file) }),
    );
    objects.deleteFailures = 1;

    await expect(service.afterCommit(ANA, file.id)).resolves.toBeUndefined();

    expect(versions.numbersOf(file.id)).toEqual([1, 2, 3, 4]);
  });
});
