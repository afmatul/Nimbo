import { randomUUID } from 'node:crypto';

import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import {
  FakeAuditLogger,
  FakeDomainEventPublisher,
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
import { FILE_VERSION_CREATED } from '../domain/file-version-created.event';
import { ObjectKey } from '../domain/object-key';

import { FileVersionService } from './file-version.service';
import type { RegisterVersionCommand } from './file-version.service';
import { VersionPruner } from './version-pruner';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const NOW = new Date('2026-10-08T10:00:00.000Z');
const NEW_BYTES = 500n;
/** Lo que mide la optimización del doble de 021: menos que la versión actual sembrada (300 bytes). */
const OPTIMIZED_BYTES = 100n;
const KEEP_DAYS = 7;
const LIMITS = {
  planName: 'Plan de prueba',
  maxFileBytes: 1_000_000n,
  storageQuotaBytes: 10_000_000n,
  trashRetentionDays: 30,
  retainedVersions: 3,
  readOnly: false,
  maxEditors: 0,
  extraQuotaBytes: 0n,
  extraQuotaUntil: null,
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
  const events = new FakeDomainEventPublisher(journal);
  const service = new FileVersionService(quotas, versions, nodes, pruner, events, logger);
  const file = seedVersionedFile({ nodes, versions, objects }, ANA, [100n, 200n, 300n]);
  return {
    journal,
    transactions,
    quotas,
    nodes,
    versions,
    objects,
    audit,
    events,
    logger,
    service,
    file,
  };
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
      FileVersion.forOrigin('optimizacion', generated(file, number, OPTIMIZED_BYTES)),
  };

/** Lo que registran 016 y 021: el mismo `register` con otro origen (OCP). */
function generated(file: File, number: number, sizeBytes = NEW_BYTES): NewVersionInput {
  const id = randomUUID();
  return {
    id,
    fileId: file.id,
    objectKey: ObjectKey.of(ANA.id, file.id, id),
    sizeBytes,
    createdBy: ANA.id,
    number,
    now: NOW,
  };
}

/** El comando de cada origen: el doble de 021 pasa los días de conservación (014b RN-3). */
const commandFor = (origin: FileVersionOrigin, file: File): RegisterVersionCommand => ({
  file,
  buildVersion: builders[origin](file),
  ...(origin === 'optimizacion' && { keepPreviousForDays: KEEP_DAYS }),
});

describe('FileVersionService (plan 014 §1, CA-4, CA-5, CA-13)', () => {
  it.each(['carga', 'restauracion', 'edicion'] as const)(
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
    'CA-5, CA-13: tras el commit de `%s`, `afterCommit` aplica la misma retención (sin auditar más)',
    async (origin) => {
      const { service, transactions, quotas, versions, audit, file } = setup();
      const registered = await transactions.withActor(ANA, () =>
        service.register(ANA, { file, buildVersion: builders[origin](file) }),
      );

      await service.afterCommit(ANA, registered);

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
    const registered = await transactions.withActor(ANA, () =>
      service.register(ANA, { file, buildVersion: builders.carga(file) }),
    );
    objects.deleteFailures = 1;

    await expect(service.afterCommit(ANA, registered)).resolves.toBeUndefined();

    expect(versions.numbersOf(file.id)).toEqual([1, 2, 3, 4]);
  });

  it.each(['carga', 'restauracion', 'edicion', 'optimizacion'] as const)(
    '019 RN-11, CA-8: tras el commit de `%s`, `afterCommit` anuncia la versión vigente antes de podar',
    async (origin) => {
      const { service, transactions, events, journal, file } = setup();
      const registered = await transactions.withActor(ANA, () =>
        service.register(ANA, commandFor(origin, file)),
      );
      journal.entries.length = 0;

      await service.afterCommit(ANA, registered);

      expect(events.published).toEqual([
        {
          name: FILE_VERSION_CREATED,
          payload: {
            fileId: file.id,
            versionId: registered.version.id,
            ownerId: file.ownerId,
            kind: file.kind,
          },
        },
      ]);
      expect(journal.entries[0]).toBe(`events:${FILE_VERSION_CREATED}`);
    },
  );

  it('019 RN-11: `register` no anuncia nada: la transacción del llamador puede revertirse', async () => {
    const { service, transactions, events, file } = setup();

    await transactions.withActor(ANA, () =>
      service.register(ANA, { file, buildVersion: builders.carga(file) }),
    );

    expect(events.published).toEqual([]);
  });

  it('019 RN-11: `announce` anuncia el archivo nuevo sin podar ni tocar la base', async () => {
    const { service, events, journal, file, versions } = setup();
    const version = versions.versions.get(file.currentVersionId);
    if (version === undefined) throw new Error('El archivo sembrado no tiene versión vigente');

    service.announce({ file, version });

    expect(events.published).toEqual([
      {
        name: FILE_VERSION_CREATED,
        payload: { fileId: file.id, versionId: version.id, ownerId: ANA.id, kind: file.kind },
      },
    ]);
    expect(journal.entries).toEqual([`events:${FILE_VERSION_CREATED}`]);
  });
});

describe('FileVersionService: optimización que conserva el original (014b)', () => {
  const optimize = (context: ReturnType<typeof setup>, keepPreviousForDays?: number) =>
    context.transactions.withActor(ANA, () =>
      context.service.register(ANA, {
        file: context.file,
        buildVersion: builders.optimizacion(context.file),
        ...(keepPreviousForDays !== undefined && { keepPreviousForDays }),
      }),
    );

  it('CA-1: la optimizada pasa a ser la actual, la anterior se conserva y el espacio cambia en Y − X una sola vez', async () => {
    const context = setup();
    const { versions, quotas, journal, file } = context;

    const registered = await optimize(context, KEEP_DAYS);

    const original = versions.versions.get(file.currentVersionId);
    expect(registered.file.currentVersionId).toBe(registered.version.id);
    expect(original?.keptUntil).toEqual(new Date('2026-10-15T10:00:00.000Z'));
    expect(original?.countsInQuota).toBe(false);
    expect(quotas.added).toEqual([OPTIMIZED_BYTES - 300n]);
    expect(journal.entries).toEqual([
      'tx:begin',
      'quota:lockUsage',
      'versions:nextNumber',
      'versions:find',
      'versions:markKept:3',
      'versions:insert:4',
      'nodes:updateCurrentVersion',
      'quota:addUsedBytes',
      'tx:end',
    ]);
  });

  it('CA-2: con la cuenta llena se registra igual y el espacio baja (`register` no valida cuota)', async () => {
    const context = setup();
    context.quotas.usage = { usedBytes: LIMITS.storageQuotaBytes, reservedBytes: 0n };

    await expect(optimize(context, KEEP_DAYS)).resolves.toBeDefined();

    expect(context.quotas.added).toEqual([OPTIMIZED_BYTES - 300n]);
  });

  it('CA-3: una optimización que no es menor se rechaza sin tocar la versión actual, el original ni el espacio', async () => {
    const context = setup();
    const { service, transactions, versions, nodes, quotas, file } = context;
    const notSmaller = (number: number) =>
      FileVersion.forOrigin('optimizacion', generated(file, number, 300n));

    await expect(
      transactions.withActor(ANA, () =>
        service.register(ANA, { file, buildVersion: notSmaller, keepPreviousForDays: KEEP_DAYS }),
      ),
    ).rejects.toThrow(TypeError);

    expect(nodes.files.get(file.id)?.currentVersionId).toBe(file.currentVersionId);
    expect(versions.versions.get(file.currentVersionId)?.countsInQuota).toBe(true);
    expect(versions.numbersOf(file.id)).toEqual([1, 2, 3]);
    expect(quotas.added).toEqual([]);
  });

  it('RN-7: si el original no se pudo marcar, se rechaza sin tocar el espacio (el contador no diverge)', async () => {
    const context = setup();
    jest.spyOn(context.versions, 'markKept').mockResolvedValue(false);

    await expect(optimize(context, KEEP_DAYS)).rejects.toThrow(TypeError);

    expect(context.quotas.added).toEqual([]);
    expect(context.versions.numbersOf(context.file.id)).toEqual([1, 2, 3]);
  });

  it('RN-3: una optimización sin días, o los días con otro origen, se rechazan', async () => {
    const context = setup();
    const { service, transactions, file } = context;

    await expect(optimize(context)).rejects.toThrow(TypeError);
    await expect(
      transactions.withActor(ANA, () =>
        service.register(ANA, {
          file,
          buildVersion: builders.carga(file),
          keepPreviousForDays: 7,
        }),
      ),
    ).rejects.toThrow(TypeError);
    expect(context.quotas.added).toEqual([]);
  });

  it('CA-13: la bitácora técnica suma solo el UUID del original conservado', async () => {
    const context = setup();

    const { version } = await optimize(context, KEEP_DAYS);

    expect(context.logger.info).toHaveBeenCalledWith({
      event: 'version.registered',
      fileId: context.file.id,
      versionId: version.id,
      versionNumber: 4,
      origin: 'optimizacion',
      keptVersionId: context.file.currentVersionId,
    });
  });
});
