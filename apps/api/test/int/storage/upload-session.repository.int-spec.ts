import { randomUUID } from 'node:crypto';

import type { DataSource } from 'typeorm';

import { FileName } from '../../../src/modules/storage/domain/file-name.vo';
import { UploadSession } from '../../../src/modules/storage/domain/upload-session';
import type { MultipartUpload } from '../../../src/modules/storage/domain/upload-session';
import { TypeOrmUploadSessionRepository } from '../../../src/modules/storage/infrastructure/persistence/typeorm-upload-session.repository';
import { createActor, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { ActorScopeMissingError } from '../../../src/shared/infrastructure/persistence/actor-scope.errors';
import { connectAsOwner } from '../../support/database-urls';

import { connectAsAppDatabase, insertAccount, removeAccounts } from './storage-test-db';
import type { AppDatabase } from './storage-test-db';

const STARTED_AT = new Date('2026-09-30T10:00:00.000Z');
const FINISHED_AT = new Date('2026-09-30T10:05:00.000Z');
const MULTIPART: MultipartUpload = {
  uploadId: 'upload-multipart-de-prueba',
  totalParts: 3,
  partSizeBytes: 8_388_608n,
};

const aSession = (owner: Actor, multipart: MultipartUpload | null = null): UploadSession =>
  UploadSession.start({
    id: randomUUID(),
    ownerId: owner.id,
    folderId: null,
    fileId: randomUUID(),
    versionId: randomUUID(),
    name: FileName.of('Informe anual.pdf'),
    keepBoth: true,
    replacesFile: false,
    declaredBytes: 9_007_199_254_740_993n,
    multipart,
    now: STARTED_AT,
  });

/** `IUploadSessionRepository` sobre Postgres como `nimbo_app` dentro de `withActor` (plan §6 «Puertos»). */
describe('TypeOrmUploadSessionRepository (CA-9, CA-10, CA-22)', () => {
  let owner: DataSource;
  let app: AppDatabase;
  let repository: TypeOrmUploadSessionRepository;
  let ana: Actor;
  let bruno: Actor;
  const created: string[] = [];

  const insertAs = async (actor: Actor, session: UploadSession): Promise<UploadSession> => {
    await app.asActor(actor, () => repository.insert(actor, session));
    return session;
  };

  const findAs = (actor: Actor, id: string): Promise<UploadSession | null> =>
    app.asActor(actor, () => repository.findOwned(actor, id));

  beforeAll(async () => {
    owner = await connectAsOwner();
    app = await connectAsAppDatabase();
    repository = new TypeOrmUploadSessionRepository(app.context);
    const accounts = await owner.transaction(async (manager) => ({
      ana: await insertAccount(manager),
      bruno: await insertAccount(manager),
    }));
    created.push(...Object.values(accounts));
    ana = createActor(accounts.ana, Role.CLIENT);
    bruno = createActor(accounts.bruno, Role.CLIENT);
  });

  afterAll(async () => {
    await app.dataSource.destroy();
    await removeAccounts(owner, created);
    await owner.destroy();
  });

  it.each([
    ['simple', null],
    ['por partes', MULTIPART],
  ])('CA-10: una carga %s va y vuelve sin perder datos (bytes exactos)', async (_, multipart) => {
    const session = await insertAs(ana, aSession(ana, multipart));

    const found = await findAs(ana, session.id);

    expect(found?.snapshot()).toEqual(session.snapshot());
    expect(found?.mode).toBe(session.mode);
  });

  it('CA-22: la carga guarda la clave final `u/{propietario}/{archivo}/{version}` desde el inicio', async () => {
    const session = await insertAs(ana, aSession(ana));

    const [row] = (await owner.query('SELECT clave_objeto FROM carga WHERE id = $1', [
      session.id,
    ])) as { clave_objeto: string }[];

    expect(row?.clave_objeto).toBe(session.objectKey.value);
  });

  it('CA-16: la carga de otro propietario no existe para el actor (RLS)', async () => {
    const session = await insertAs(bruno, aSession(bruno));

    await expect(findAs(ana, session.id)).resolves.toBeNull();
  });

  it('CA-16: un cliente no puede reservar una carga a nombre de otro', async () => {
    await expect(insertAs(ana, aSession(bruno))).rejects.toThrow(/row-level security/);
  });

  describe('transition (compare-and-set)', () => {
    it('CA-9: `activa → expirada` gana una vez; la segunda transición desde `activa` no toca la fila', async () => {
      const session = await insertAs(ana, aSession(ana));

      const [first, second] = await app.asActor(ana, async () => [
        await repository.transition(ana, session.id, 'activa', 'expirada', {
          at: FINISHED_AT,
          rejectionReason: null,
        }),
        await repository.transition(ana, session.id, 'activa', 'cancelada', {
          at: new Date(FINISHED_AT.getTime() + 1),
          rejectionReason: null,
        }),
      ]);

      expect([first, second]).toEqual([true, false]);
      const found = await findAs(ana, session.id);
      expect(found?.snapshot()).toEqual(session.expire(FINISHED_AT).snapshot());
    });

    it('CA-10: `activa → rechazada` guarda el motivo y la marca de fin', async () => {
      const session = await insertAs(ana, aSession(ana, MULTIPART));

      const won = await app.asActor(ana, () =>
        repository.transition(ana, session.id, 'activa', 'rechazada', {
          at: FINISHED_AT,
          rejectionReason: 'tipo_invalido',
        }),
      );

      expect(won).toBe(true);
      const found = await findAs(ana, session.id);
      expect(found?.snapshot()).toEqual(session.reject('tipo_invalido', FINISHED_AT).snapshot());
    });

    it('CA-16: la transición sobre una carga ajena no toca ninguna fila', async () => {
      const session = await insertAs(bruno, aSession(bruno));

      const won = await app.asActor(ana, () =>
        repository.transition(ana, session.id, 'activa', 'cancelada', {
          at: FINISHED_AT,
          rejectionReason: null,
        }),
      );

      expect(won).toBe(false);
      expect((await findAs(bruno, session.id))?.state).toBe('activa');
    });

    it('CA-9: dos transiciones concurrentes desde `activa`: exactamente una gana', async () => {
      const session = await insertAs(ana, aSession(ana));
      const attempt = (to: 'cancelada' | 'expirada'): Promise<boolean> =>
        app.asActor(ana, () =>
          repository.transition(ana, session.id, 'activa', to, {
            at: FINISHED_AT,
            rejectionReason: null,
          }),
        );

      const results = await Promise.all([attempt('cancelada'), attempt('expirada')]);

      expect(results.filter(Boolean)).toHaveLength(1);
    });
  });

  it('CA-16: todo método exige `withActor`', async () => {
    const session = aSession(ana);

    await expect(repository.insert(ana, session)).rejects.toBeInstanceOf(ActorScopeMissingError);
    await expect(repository.findOwned(ana, session.id)).rejects.toBeInstanceOf(
      ActorScopeMissingError,
    );
    await expect(
      repository.transition(ana, session.id, 'activa', 'cancelada', {
        at: FINISHED_AT,
        rejectionReason: null,
      }),
    ).rejects.toBeInstanceOf(ActorScopeMissingError);
  });

  it('ADR-0021: el puerto no lista cargas vencidas (eso es `IExpiredUploadScanner`)', () => {
    expect('listExpiredIds' in repository).toBe(false);
  });
});
