import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import {
  FakeAuditLogger,
  FakeFileTypeDetector,
  FakeNodeRepository,
  FakeObjectStorage,
  FakeQuotaRepository,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { FakeVersionRepository, seedVersionedFile } from '../../../../test/support/version-fakes';
import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { ObjectKey } from '../domain/object-key';

import { EditedVersionRegistrar } from './edited-version.registrar';
import type { EditedVersionInput } from './edited-version.registrar';
import { FileVersionService } from './file-version.service';
import { VersionPruner } from './version-pruner';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const BRUNO_ID = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-16T12:00:00.000Z');
const EDITED = Buffer.from('documento editado por la sesión');
const LIMITS = {
  planName: 'Plan de prueba',
  maxFileBytes: 1_000_000n,
  storageQuotaBytes: 10_000_000n,
  trashRetentionDays: 30,
  retainedVersions: 3,
  maxEditors: 3,
};

function setup() {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const quotas = new FakeQuotaRepository(journal, transactions.locks);
  const nodes = new FakeNodeRepository(journal);
  const versions = new FakeVersionRepository(journal);
  const objects = new FakeObjectStorage(journal);
  const detector = new FakeFileTypeDetector(journal);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const audit = new FakeAuditLogger(journal);
  const limits = new FakePlanLimitsProvider(LIMITS);
  const pruner = new VersionPruner(
    transactions,
    nodes,
    versions,
    quotas,
    objects,
    limits,
    audit,
    logger,
  );
  const fileVersions = new FileVersionService(quotas, versions, nodes, pruner, logger);
  const registrar = new EditedVersionRegistrar(
    transactions,
    nodes,
    versions,
    quotas,
    objects,
    detector,
    fileVersions,
    new FixedClock(NOW),
  );
  const file = seedVersionedFile({ nodes, versions, objects }, ANA, [100n, 200n]);
  return { journal, quotas, nodes, versions, objects, detector, registrar, file };
}

const inputFor = (fileId: string, content: Buffer = EDITED): EditedVersionInput => ({
  fileId,
  versionId: randomUUID(),
  editSessionId: randomUUID(),
  createdBy: BRUNO_ID,
  content: Readable.from([content]),
  sizeBytes: BigInt(content.length),
});

describe('EditedVersionRegistrar (plan 016 §2, ADR-0012)', () => {
  it('CA-9: registra una versión `edicion` vigente con su sesión, quien abrió y el contenido entregado', async () => {
    const { registrar, file, nodes, versions, objects, quotas } = setup();
    const input = inputFor(file.id);

    const outcome = await registrar.register(ANA, input);

    expect(outcome).toEqual({
      status: 'registered',
      versionId: input.versionId,
      versionNumber: 3,
      sizeBytes: BigInt(EDITED.length),
    });
    const version = versions.versions.get(input.versionId);
    expect(version?.origin).toBe('edicion');
    expect(version?.editSessionId).toBe(input.editSessionId);
    expect(version?.createdBy).toBe(BRUNO_ID);
    expect(version?.createdAt).toEqual(NOW);
    expect(nodes.files.get(file.id)?.currentVersionId).toBe(input.versionId);
    const key = ObjectKey.of(ANA.id, file.id, input.versionId).value;
    expect(objects.objects.get(key)).toEqual(EDITED);
    expect(quotas.added).toEqual([BigInt(EDITED.length)]);
  });

  it('CA-20: no valida cuota: la versión se registra aunque la cuenta ya esté sobre su cuota (RN-8)', async () => {
    const { registrar, file, quotas, journal } = setup();
    quotas.usage = { usedBytes: LIMITS.storageQuotaBytes * 2n, reservedBytes: 0n };

    const outcome = await registrar.register(ANA, inputFor(file.id));

    expect(outcome.status).toBe('registered');
    expect(journal.entries).not.toContain('quota:readUsage');
  });

  it('CA-10: el mismo `versionId` otra vez no crea otra versión ni vuelve a subir el contenido', async () => {
    const { registrar, file, versions, journal } = setup();
    const input = inputFor(file.id);
    await registrar.register(ANA, input);
    journal.entries.length = 0;

    const again = await registrar.register(ANA, { ...input, content: Readable.from([EDITED]) });

    expect(again).toEqual({ status: 'duplicate', versionId: input.versionId });
    expect(versions.numbersOf(file.id)).toEqual([1, 2, 3]);
    expect(journal.entries).not.toContain('storage:putObjectStream');
  });

  it('CA-14: un documento que no es un `.docx` íntegro no se registra y su objeto se borra', async () => {
    const { registrar, file, detector, versions, objects, nodes } = setup();
    detector.result = { ok: false, reason: 'signature' };
    const input = inputFor(file.id);

    const outcome = await registrar.register(ANA, input);

    expect(outcome).toEqual({ status: 'corrupt' });
    expect(detector.calls).toEqual([{ extension: 'docx', size: EDITED.length }]);
    expect(versions.numbersOf(file.id)).toEqual([1, 2]);
    expect(nodes.files.get(file.id)?.currentVersionId).toBe(file.currentVersionId);
    expect(objects.purged).toEqual([ObjectKey.of(ANA.id, file.id, input.versionId).value]);
  });

  it('CA-14: un archivo que el actor ya no ve vivo (purgado o ajeno) no sube nada', async () => {
    const { registrar, journal } = setup();

    const outcome = await registrar.register(ANA, inputFor(randomUUID()));

    expect(outcome).toEqual({ status: 'file_missing' });
    expect(journal.entries).not.toContain('storage:putObjectStream');
  });

  it('CA-13: tras el commit poda lo que excede las versiones retenidas del plan', async () => {
    const { registrar, file, versions } = setup();
    await registrar.register(ANA, inputFor(file.id));

    await registrar.register(ANA, inputFor(file.id));

    expect(versions.numbersOf(file.id)).toEqual([2, 3, 4]);
  });

  it('Art. XI: si la transacción falla, el error sigue (el trabajo reintenta) y el objeto subido se borra', async () => {
    const { registrar, file, objects, quotas } = setup();
    jest.spyOn(quotas, 'addUsedBytes').mockRejectedValueOnce(new Error('BD caída'));
    const input = inputFor(file.id);

    await expect(registrar.register(ANA, input)).rejects.toThrow('BD caída');

    expect(objects.purged).toEqual([ObjectKey.of(ANA.id, file.id, input.versionId).value]);
  });
});
