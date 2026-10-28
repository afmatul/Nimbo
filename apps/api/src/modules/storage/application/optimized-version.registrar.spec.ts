import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import {
  FakeAuditLogger,
  FakeDomainEventPublisher,
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
import { File } from '../domain/file';
import { FileName } from '../domain/file-name.vo';
import { FILE_VERSION_CREATED } from '../domain/file-version-created.event';
import { ObjectKey } from '../domain/object-key';
import { TrashState } from '../domain/trash-state';

import { FileVersionService } from './file-version.service';
import { OptimizedVersionRegistrar } from './optimized-version.registrar';
import type { OptimizedVersionInput } from './optimized-version.registrar';
import { VersionPruner } from './version-pruner';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const BRUNO: Actor = createActor('22222222-2222-4222-8222-222222222222', Role.CLIENT);
const NOW = new Date('2026-10-26T12:00:00.000Z');
const DAY_MS = 86_400_000;
const ORIGINAL_BYTES = 200n;
const OPTIMIZED = Buffer.alloc(120, 7);
const LIMITS = {
  planName: 'Plan de prueba',
  maxFileBytes: 1_000_000n,
  storageQuotaBytes: 10_000_000n,
  trashRetentionDays: 7,
  retainedVersions: 3,
  maxEditors: 3,
  readOnly: false,
};

/** El archivo sembrado, pero como una imagen JPEG (`foto.jpg`, tipo `imagen`). */
const asImage = (file: File): File =>
  File.create({
    id: file.id,
    ownerId: file.ownerId,
    folderId: null,
    name: FileName.of('foto-7f3a.jpg'),
    kind: 'imagen',
    sizeBytes: file.sizeBytes,
    currentVersionId: file.currentVersionId,
    now: file.createdAt,
  });

function setup() {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const quotas = new FakeQuotaRepository(journal, transactions.locks);
  const nodes = new FakeNodeRepository(journal);
  const versions = new FakeVersionRepository(journal, nodes);
  const objects = new FakeObjectStorage(journal);
  const detector = new FakeFileTypeDetector(journal);
  detector.result = { ok: true, kind: 'imagen', mime: 'image/jpeg' };
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
  const events = new FakeDomainEventPublisher(journal);
  const fileVersions = new FileVersionService(quotas, versions, nodes, pruner, events, logger);
  const registrar = new OptimizedVersionRegistrar(
    transactions,
    nodes,
    versions,
    quotas,
    objects,
    detector,
    fileVersions,
    limits,
    new FixedClock(NOW),
    logger,
  );
  const file = asImage(
    seedVersionedFile({ nodes, versions, objects }, ANA, [100n, ORIGINAL_BYTES]),
  );
  nodes.files.set(file.id, file);
  return { journal, quotas, nodes, versions, objects, detector, events, registrar, file, logger };
}

const inputFor = (file: File, content: Buffer = OPTIMIZED): OptimizedVersionInput => ({
  fileId: file.id,
  sourceVersionId: file.currentVersionId,
  versionId: randomUUID(),
  content: Readable.from([content]),
  sizeBytes: BigInt(content.length),
});

const keyOf = (file: File, versionId: string): string =>
  ObjectKey.of(file.ownerId, file.id, versionId).value;

describe('OptimizedVersionRegistrar (plan 021 §2, PD-130)', () => {
  it('registra la versión `optimizacion` vigente y conserva el original según 014b (CA-15)', async () => {
    const { registrar, file, nodes, versions, objects, quotas } = setup();
    const input = inputFor(file);

    const outcome = await registrar.register(ANA, input);

    expect(outcome).toEqual({
      status: 'registered',
      versionId: input.versionId,
      versionNumber: 3,
      sizeBytes: BigInt(OPTIMIZED.length),
    });
    const version = versions.versions.get(input.versionId);
    expect(version?.origin).toBe('optimizacion');
    expect(version?.createdBy).toBe(ANA.id);
    expect(version?.createdAt).toEqual(NOW);
    expect(nodes.files.get(file.id)?.currentVersionId).toBe(input.versionId);
    expect(objects.objects.get(keyOf(file, input.versionId))).toEqual(OPTIMIZED);
    const original = versions.versions.get(file.currentVersionId);
    expect(original?.keptUntil).toEqual(
      new Date(NOW.getTime() + LIMITS.trashRetentionDays * DAY_MS),
    );
    expect(original?.countsInQuota).toBe(false);
    expect(quotas.added).toEqual([BigInt(OPTIMIZED.length) - ORIGINAL_BYTES]);
  });

  it('comprueba la firma real del resultado con la extensión del archivo', async () => {
    const { registrar, file, detector } = setup();

    await registrar.register(ANA, inputFor(file));

    expect(detector.calls).toEqual([{ extension: 'jpg', size: OPTIMIZED.length }]);
  });

  it('019 RN-11: anuncia la versión después del commit, con el propietario y el tipo', async () => {
    const { registrar, file, events, journal } = setup();
    const input = inputFor(file);

    await registrar.register(ANA, input);

    expect(events.published).toEqual([
      {
        name: FILE_VERSION_CREATED,
        payload: { fileId: file.id, versionId: input.versionId, ownerId: ANA.id, kind: 'imagen' },
      },
    ]);
    const commit = journal.entries.indexOf('tx:end', journal.indexOf('quota:addUsedBytes'));
    expect(journal.indexOf(`events:${FILE_VERSION_CREATED}`)).toBeGreaterThan(commit);
  });

  it('CA-12: el mismo `versionId` otra vez es `duplicate`, sin subir ni borrar el objeto registrado', async () => {
    const { registrar, file, versions, objects, journal } = setup();
    const input = inputFor(file);
    await registrar.register(ANA, input);
    journal.entries.length = 0;

    const again = await registrar.register(ANA, { ...input, content: Readable.from([OPTIMIZED]) });

    expect(again).toEqual({
      status: 'duplicate',
      versionId: input.versionId,
      sizeBytes: BigInt(OPTIMIZED.length),
    });
    expect(versions.numbersOf(file.id)).toEqual([1, 2, 3]);
    expect(journal.entries).not.toContain('storage:putObjectStream');
    expect(objects.purged).toEqual([]);
    expect(objects.objects.get(keyOf(file, input.versionId))).toEqual(OPTIMIZED);
  });

  it('CA-11: si la versión de origen ya no es la vigente, es `file_changed` y no sube nada', async () => {
    const { registrar, file, versions, journal } = setup();
    const input = { ...inputFor(file), sourceVersionId: randomUUID() };

    const outcome = await registrar.register(ANA, input);

    expect(outcome).toEqual({ status: 'file_changed' });
    expect(versions.numbersOf(file.id)).toEqual([1, 2]);
    expect(journal.entries).not.toContain('storage:putObjectStream');
  });

  it('CA-11: si otra versión llega mientras se sube, se revalida bajo `lockUsage`: `file_changed` y el objeto se borra', async () => {
    const { registrar, file, nodes, versions, objects, quotas } = setup();
    const input = inputFor(file);
    const put = objects.putObjectStream.bind(objects);
    jest.spyOn(objects, 'putObjectStream').mockImplementationOnce(async (key, content, size) => {
      await put(key, content, size);
      const replaced = File.rehydrate({ ...file.snapshot(), currentVersionId: randomUUID() });
      nodes.files.set(file.id, replaced);
    });

    const outcome = await registrar.register(ANA, input);

    expect(outcome).toEqual({ status: 'file_changed' });
    expect(versions.versions.has(input.versionId)).toBe(false);
    expect(objects.purged).toEqual([keyOf(file, input.versionId)]);
    expect(quotas.added).toEqual([]);
  });

  it.each([
    ['mayor', ORIGINAL_BYTES + 1n],
    ['igual', ORIGINAL_BYTES],
  ])(
    'un resultado %s que el original es `not_smaller`: no sube nada ni llega al invariante de 014b',
    async (_case, size) => {
      const { registrar, file, versions, journal, quotas } = setup();
      const content = Buffer.alloc(Number(size), 1);

      const outcome = await registrar.register(ANA, inputFor(file, content));

      expect(outcome).toEqual({ status: 'not_smaller' });
      expect(versions.numbersOf(file.id)).toEqual([1, 2]);
      expect(versions.versions.get(file.currentVersionId)?.countsInQuota).toBe(true);
      expect(journal.entries).not.toContain('storage:putObjectStream');
      expect(quotas.added).toEqual([]);
    },
  );

  it.each([
    ['inexistente', (file: File) => ({ actor: ANA, fileId: randomUUID(), file })],
    ['ajeno', (file: File) => ({ actor: BRUNO, fileId: file.id, file })],
  ])('un archivo %s es `file_missing` y no sube nada', async (_case, scenario) => {
    const { registrar, file, journal } = setup();
    const { actor, fileId } = scenario(file);

    const outcome = await registrar.register(actor, { ...inputFor(file), fileId });

    expect(outcome).toEqual({ status: 'file_missing' });
    expect(journal.entries).not.toContain('storage:putObjectStream');
  });

  it('un archivo en la papelera es `file_missing` (RN-5: solo el archivo propio y vivo)', async () => {
    const { registrar, file, nodes, journal } = setup();
    nodes.files.set(
      file.id,
      File.rehydrate({ ...file.snapshot(), trash: TrashState.start(NOW, 7) }),
    );

    const outcome = await registrar.register(ANA, inputFor(file));

    expect(outcome).toEqual({ status: 'file_missing' });
    expect(journal.entries).not.toContain('storage:putObjectStream');
  });

  it.each([
    ['la firma no es la de la extensión', { ok: false, reason: 'signature' } as const],
    ['el contenido es de otro tipo', { ok: true, kind: 'pdf', mime: 'application/pdf' } as const],
  ])('si %s es `corrupt` y el objeto subido se borra', async (_case, result) => {
    const { registrar, file, detector, versions, objects, events } = setup();
    detector.result = result;
    const input = inputFor(file);

    const outcome = await registrar.register(ANA, input);

    expect(outcome).toEqual({ status: 'corrupt' });
    expect(versions.numbersOf(file.id)).toEqual([1, 2]);
    expect(objects.purged).toEqual([keyOf(file, input.versionId)]);
    expect(events.published).toEqual([]);
  });

  it('Art. XI: si la transacción falla, el error sigue (el trabajo reintenta) y el objeto subido se borra', async () => {
    const { registrar, file, objects, quotas, events } = setup();
    jest.spyOn(quotas, 'addUsedBytes').mockRejectedValueOnce(new Error('BD caída'));
    const input = inputFor(file);

    await expect(registrar.register(ANA, input)).rejects.toThrow('BD caída');

    expect(events.published).toEqual([]);
    expect(objects.purged).toEqual([keyOf(file, input.versionId)]);
  });

  it('Art. XI: si leer la firma falla después de subir, purga el candidato sin registrar ni cambiar archivo o uso', async () => {
    const { registrar, file, detector, objects, nodes, versions, quotas, events, journal } =
      setup();
    const input = inputFor(file);
    const failure = new Error('MinIO no pudo leer el candidato');
    jest.spyOn(detector, 'detect').mockImplementationOnce(async (reader) => {
      expect(objects.objects.has(keyOf(file, input.versionId))).toBe(true);
      await reader.read(0, 4);
      return detector.result;
    });
    jest.spyOn(objects, 'getRange').mockRejectedValueOnce(failure);

    await expect(registrar.register(ANA, input)).rejects.toBe(failure);

    expect(objects.purged).toEqual([keyOf(file, input.versionId)]);
    expect(objects.objects.has(keyOf(file, input.versionId))).toBe(false);
    expect(versions.numbersOf(file.id)).toEqual([1, 2]);
    expect(nodes.files.get(file.id)).toBe(file);
    expect(quotas.added).toEqual([]);
    expect(events.published).toEqual([]);
    expect(journal.entries.filter((entry) => entry === 'storage:purgeObject')).toHaveLength(1);
  });

  it('Art. XI: si también falla la compensación, la registra y conserva el error original sin purgar dos veces', async () => {
    const { registrar, file, detector, objects, nodes, versions, quotas, logger } = setup();
    const input = inputFor(file);
    const failure = new Error('Lectura fallida');
    const cleanupFailure = new Error('MinIO no pudo purgar el candidato');
    jest.spyOn(detector, 'detect').mockRejectedValueOnce(failure);
    const purge = jest.spyOn(objects, 'purgeObject').mockRejectedValueOnce(cleanupFailure);

    await expect(registrar.register(ANA, input)).rejects.toBe(failure);

    expect(purge).toHaveBeenCalledTimes(1);
    expect(purge).toHaveBeenCalledWith(keyOf(file, input.versionId));
    expect(versions.numbersOf(file.id)).toEqual([1, 2]);
    expect(nodes.files.get(file.id)).toBe(file);
    expect(quotas.added).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith({
      event: 'version.optimization_discard_failed',
      fileId: file.id,
      versionId: input.versionId,
      errorName: 'Error',
    });
  });
});
