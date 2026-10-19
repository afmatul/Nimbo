import { randomUUID } from 'node:crypto';

import { FakePlanLimitsProvider } from '../../../../test/support/fake-plan-limits.provider';
import {
  FakeAuditLogger,
  FakeNodeRepository,
  FakeObjectStorage,
  FakeQuotaRepository,
  FakeTransactionRunner,
  FakeUploadSessionRepository,
  Journal,
} from '../../../../test/support/storage-fakes';
import { FakeVersionRepository, seedVersionedFile } from '../../../../test/support/version-fakes';
import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { File } from '../domain/file';
import { FileName } from '../domain/file-name.vo';
import { TrashState } from '../domain/trash-state';
import { UploadSession } from '../domain/upload-session';

import { FileVersionService } from './file-version.service';
import { UploadRegistrar } from './upload-registrar';
import type { VerifiedUpload } from './upload-registrar';
import { VersionPruner } from './version-pruner';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const NOW = new Date('2026-10-08T10:00:00.000Z');
const LIMITS = {
  planName: 'Plan de prueba',
  maxFileBytes: 1_000_000n,
  storageQuotaBytes: 10_000_000n,
  trashRetentionDays: 30,
  retainedVersions: 3,
  readOnly: false,
  maxEditors: 0,
};
const VERIFIED: VerifiedUpload = { sizeBytes: 500n, kind: 'docx' };

function setup() {
  const journal = new Journal();
  const clock = new FixedClock(NOW);
  const transactions = new FakeTransactionRunner(journal);
  const quotas = new FakeQuotaRepository(journal, transactions.locks);
  const sessions = new FakeUploadSessionRepository(journal);
  const nodes = new FakeNodeRepository(journal);
  const versions = new FakeVersionRepository(journal);
  const objects = new FakeObjectStorage(journal);
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const pruner = new VersionPruner(
    transactions,
    nodes,
    versions,
    quotas,
    objects,
    new FakePlanLimitsProvider(LIMITS),
    new FakeAuditLogger(journal),
    logger,
  );
  const fileVersions = new FileVersionService(quotas, versions, nodes, pruner, logger);
  const registrar = new UploadRegistrar(transactions, quotas, sessions, nodes, fileVersions, clock);
  return { journal, quotas, sessions, nodes, versions, objects, registrar };
}

type Setup = ReturnType<typeof setup>;

/** Carga activa que reemplaza `file` (o crea uno nuevo si `file` es `null`). */
function activeUpload(ctx: Setup, file: File | null): UploadSession {
  const session = UploadSession.start({
    id: randomUUID(),
    ownerId: ANA.id,
    fileId: file?.id ?? randomUUID(),
    versionId: randomUUID(),
    folderId: null,
    name: file?.name ?? FileName.of('informe.docx'),
    keepBoth: false,
    replacesFile: file !== null,
    declaredBytes: VERIFIED.sizeBytes,
    multipart: null,
    now: NOW,
  });
  ctx.sessions.put(session);
  return session;
}

describe('UploadRegistrar con reemplazo (014)', () => {
  it('CA-1, CA-4: bloquea el uso, comprueba el archivo vivo, cierra la carga y registra la versión siguiente', async () => {
    const ctx = setup();
    const file = seedVersionedFile(ctx, ANA, [100n, 200n]);
    const session = activeUpload(ctx, file);

    const registration = await ctx.registrar.register(ANA, session, VERIFIED);

    expect(registration).toMatchObject({ outcome: 'registered', file: { id: file.id } });
    expect(registration.outcome === 'registered' && registration.version.number).toBe(3);
    expect(ctx.journal.entries.slice(0, 10)).toEqual([
      'tx:begin',
      'quota:lockUsage',
      'nodes:findAccessibleById',
      'session:transition:completada',
      'quota:lockUsage',
      'versions:nextNumber',
      'versions:insert:3',
      'nodes:updateCurrentVersion',
      'quota:addUsedBytes',
      'tx:end',
    ]);
    expect(ctx.nodes.inserted).toEqual([]);
    expect(ctx.quotas.added).toEqual([VERIFIED.sizeBytes]);
  });

  it('CA-13: después del commit poda lo que sobra, cada versión en su transacción', async () => {
    const ctx = setup();
    const file = seedVersionedFile(ctx, ANA, [100n, 200n, 300n]);
    const session = activeUpload(ctx, file);

    await ctx.registrar.register(ANA, session, VERIFIED);

    const firstEnd = ctx.journal.indexOf('tx:end');
    expect(ctx.journal.indexOf('versions:delete:1')).toBeGreaterThan(firstEnd);
    expect(ctx.versions.numbersOf(file.id)).toEqual([2, 3, 4]);
  });

  it('CA-1: si el archivo ya no está vivo, cancela la carga sin versión ni espacio (`destination_gone`)', async () => {
    const ctx = setup();
    const file = seedVersionedFile(ctx, ANA, [100n]);
    const session = activeUpload(ctx, file);
    ctx.nodes.files.set(
      file.id,
      File.rehydrate({
        ...file.snapshot(),
        trash: TrashState.start(NOW, LIMITS.trashRetentionDays),
      }),
    );

    const registration = await ctx.registrar.register(ANA, session, VERIFIED);

    expect(registration).toEqual({ outcome: 'destination_gone' });
    expect(ctx.sessions.sessions.get(session.id)?.state).toBe('cancelada');
    expect(ctx.versions.numbersOf(file.id)).toEqual([1]);
    expect(ctx.quotas.added).toEqual([]);
  });

  it('Art. XI: si pierde el CAS, no registra versión ni poda', async () => {
    const ctx = setup();
    const file = seedVersionedFile(ctx, ANA, [100n, 200n, 300n]);
    const session = activeUpload(ctx, file);
    ctx.sessions.raceTo = 'cancelada';

    const registration = await ctx.registrar.register(ANA, session, VERIFIED);

    expect(registration).toEqual({ outcome: 'race_lost' });
    expect(ctx.versions.numbersOf(file.id)).toEqual([1, 2, 3]);
    expect(ctx.quotas.added).toEqual([]);
  });

  it('CA-1: una carga nueva sigue insertando el archivo con su versión 1', async () => {
    const ctx = setup();
    const session = activeUpload(ctx, null);

    const registration = await ctx.registrar.register(ANA, session, VERIFIED);

    expect(registration.outcome === 'registered' && registration.version.number).toBe(1);
    expect(ctx.nodes.inserted.map(({ file }) => file.id)).toEqual([session.fileId]);
  });
});
