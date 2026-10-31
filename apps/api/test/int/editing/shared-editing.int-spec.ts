import { JwtService } from '@nestjs/jwt';

import { createActor, Role } from '../../../src/shared';
import type { Actor } from '../../../src/shared';
import { settle } from '../realtime/realtime-test-app';
import { waitForLog } from '../setup/wait-for-log';
import { insertShare } from '../sharing/sharing-test-db';
import type { StorageClient } from '../storage/storage-http';
import { connectAsAppDatabase } from '../storage/storage-test-db';
import type { AppDatabase } from '../storage/storage-test-db';

import { docxBytes } from './docx-bytes';
import { uploadDocx } from './edited-version-world';
import { callbackUrlOf, createEditingHttpApp, PAID_TEST_LIMITS } from './editing-http';
import type { EditingHttpApp } from './editing-http';
import { FakeOnlyOfficeServer } from './fake-onlyoffice-server';

/** Estados del aviso de ONLYOFFICE (`callbackUrl`). */
const EDITING = 1;
const READY_FOR_SAVING = 2;
const ACK = { error: 0 };
const BRUNO_NAME = 'Bruno Díaz';

interface OpenBody {
  readonly sessionId: string | null;
  readonly mode: 'edit' | 'view';
  readonly readOnlyReason: string | null;
  readonly config: unknown;
  readonly participants: readonly { userId: string; displayName: string }[];
}

/** Un `.docx` de Ana compartido con Bruno al nivel dado, como lo deja `POST /shares`. */
interface SharedDocx {
  readonly ana: StorageClient;
  readonly bruno: StorageClient;
  readonly fileId: string;
  readonly shareId: string;
}

/**
 * Edición de lo compartido (spec 012 CA-15, S-6; 016 CA-16) con `storage`, `editing` y Postgres reales como `nimbo_app`
 * (RLS) y el `OnlyOfficeEditor` real contra un doble HTTP. La compartición se inserta por SQL (la ruta de `sharing` es
 * otra tarea) y la revocación borra su fila, que es el efecto de `DELETE /shares/:id`.
 */
describe('el Editor edita lo compartido y el Lector lo ve (012 CA-15)', () => {
  let onlyOffice: FakeOnlyOfficeServer;
  let editing: EditingHttpApp;
  let app: AppDatabase;

  beforeAll(async () => {
    onlyOffice = await FakeOnlyOfficeServer.start();
    editing = await createEditingHttpApp({ onlyOffice });
    app = await connectAsAppDatabase();
  });

  afterAll(async () => {
    await app?.dataSource.destroy();
    await editing?.close();
    await onlyOffice?.close();
  });

  beforeEach(() => {
    editing.storage.limits.setLimits(PAID_TEST_LIMITS);
  });

  const storage = () => editing.storage;
  const owner = () => storage().owner;

  const sharedDocx = async (level: 'EDITOR' | 'VIEWER'): Promise<SharedDocx> => {
    const [ana, bruno] = [await storage().newClient(), await storage().newClient()];
    await owner().query('UPDATE usuario SET nombre = $1 WHERE id = $2', [BRUNO_NAME, bruno.id]);
    const { fileId } = await uploadDocx(storage(), ana);
    const share = { ownerId: ana.id, granteeId: bruno.id, node: { fileId }, level };
    return { ana, bruno, fileId, shareId: await insertShare(owner(), share) };
  };

  const openBody = async (client: StorageClient, fileId: string): Promise<OpenBody> => {
    const response = await editing.open(client, fileId);
    if (response.status !== 200) throw new Error(`Apertura rechazada: ${String(response.status)}`);
    return response.body as OpenBody;
  };

  const revoke = (shareId: string) =>
    owner().query('DELETE FROM comparticion WHERE id = $1', [shareId]);

  const sessionsOf = (fileId: string) =>
    owner().query<{ propietario_id: string; abierta_por: string }[]>(
      'SELECT propietario_id, abierta_por FROM sesion_edicion WHERE archivo_id = $1',
      [fileId],
    );

  const participantsOf = (sessionId: string) =>
    owner().query<{ usuario_id: string; salio_en: Date | null }[]>(
      'SELECT usuario_id, salio_en FROM participacion WHERE sesion_edicion_id = $1 ORDER BY entro_en',
      [sessionId],
    );

  const statusOne = (body: OpenBody, users: readonly string[]) =>
    editing.callback(callbackUrlOf(body.config), {
      key: body.sessionId,
      status: EDITING,
      users,
    });

  const asClient = (id: string): Actor => createActor(id, Role.CLIENT);

  it('CA-15: el Editor abre en edición, crea la sesión de la propietaria y figura con su nombre en lo que se guarda', async () => {
    const { ana, bruno, fileId } = await sharedDocx('EDITOR');

    const opened = await openBody(bruno, fileId);
    const joined = await openBody(ana, fileId);
    const response = await editing.callback(callbackUrlOf(opened.config), {
      key: opened.sessionId,
      status: READY_FOR_SAVING,
      url: onlyOffice.serve(docxBytes()),
      users: [],
    });
    await waitForLog(
      storage().testApp.logs,
      (line) => line.event === 'editing.saved' && line.sessionId === opened.sessionId,
    );

    expect(opened).toMatchObject({ mode: 'edit', readOnlyReason: null });
    expect(opened.participants).toEqual([{ userId: bruno.id, displayName: BRUNO_NAME }]);
    expect(joined.sessionId).toBe(opened.sessionId);
    expect(joined.participants.map(({ displayName }) => displayName)).toContain(BRUNO_NAME);
    expect(await sessionsOf(fileId)).toEqual([{ propietario_id: ana.id, abierta_por: bruno.id }]);
    expect(response.body).toEqual(ACK);
    const [version] = await owner().query<{ creado_por: string }[]>(
      "SELECT creado_por FROM version_archivo WHERE archivo_id = $1 AND origen = 'edicion'",
      [fileId],
    );
    expect(version?.creado_por).toBe(bruno.id);
    expect((await participantsOf(opened.sessionId ?? '')).map((row) => row.usuario_id)).toEqual([
      bruno.id,
      ana.id,
    ]);
  });

  it('CA-15 (016 CA-8): el Editor que cierra la pestaña libera su plaza en la sesión de la propietaria', async () => {
    const { bruno, fileId } = await sharedDocx('EDITOR');
    const socket = await editing.connect(bruno.id);
    const response = await editing.open(bruno, fileId, { connectionId: socket.id });
    const { sessionId } = response.body as OpenBody;

    socket.disconnect();
    await settle();

    expect(response.status).toBe(200);
    expect((await participantsOf(sessionId ?? ''))[0]?.salio_en).toBeInstanceOf(Date);
  });

  it('CA-15: el Lector abre en solo lectura, sin sesión ni participación, aunque la propietaria esté editando', async () => {
    const { ana, bruno, fileId } = await sharedDocx('VIEWER');
    const editingAna = await openBody(ana, fileId);

    const viewed = await openBody(bruno, fileId);

    expect(viewed).toMatchObject({
      mode: 'view',
      readOnlyReason: 'EDITING_VIEW_ONLY',
      sessionId: null,
    });
    expect((await participantsOf(editingAna.sessionId ?? '')).map((row) => row.usuario_id)).toEqual(
      [ana.id],
    );
  });

  it('CA-15, S-6: revocado con la sesión abierta, la siguiente verificación lo saca de la sesión y del editor y ya no vuelve a entrar', async () => {
    const { ana, bruno, fileId, shareId } = await sharedDocx('EDITOR');
    const opened = await openBody(bruno, fileId);
    await openBody(ana, fileId);

    await revoke(shareId);
    const response = await statusOne(opened, [ana.id, bruno.id]);
    const reopened = await editing.open(bruno, fileId);

    expect(response.body).toEqual(ACK);
    const rows = await participantsOf(opened.sessionId ?? '');
    expect(rows.find((row) => row.usuario_id === bruno.id)?.salio_en).not.toBeNull();
    expect(rows.find((row) => row.usuario_id === ana.id)?.salio_en).toBeNull();
    const drops = onlyOffice.commands.map((command) =>
      new JwtService({}).decode<{ c: string; key: string; users: string[] }>(
        (JSON.parse(command) as { token: string }).token,
      ),
    );
    expect(drops).toContainEqual(
      expect.objectContaining({ c: 'drop', key: opened.sessionId, users: [bruno.id] }),
    );
    expect(reopened.status).toBe(404);
    expect((await participantsOf(opened.sessionId ?? '')).map((row) => row.salio_en)).toEqual([
      expect.any(Date),
      null,
    ]);
  });

  describe('RLS de `sesion_edicion` y `participacion` para lo compartido (plan 012 §3, PD-108)', () => {
    const sessionCount = (actor: Actor, fileId: string) =>
      app.asActor(actor, async (manager) => {
        const [row] = (await manager.query(
          'SELECT count(*)::int AS n FROM sesion_edicion WHERE archivo_id = $1',
          [fileId],
        )) as { n: number }[];
        return row?.n;
      });

    it('el Editor ve la sesión y sus participantes, pero solo escribe su propia participación', async () => {
      const { ana, bruno, fileId } = await sharedDocx('EDITOR');
      const carla = await storage().newClient();
      const { sessionId } = await openBody(ana, fileId);

      const [seen, others, updated] = await app.asActor(asClient(bruno.id), async (manager) => [
        (await manager.query(
          'SELECT count(*)::int AS n FROM participacion WHERE sesion_edicion_id = $1',
          [sessionId],
        )) as { n: number }[],
        (await manager.query(
          'UPDATE participacion SET salio_en = now() WHERE sesion_edicion_id = $1 AND usuario_id = $2',
          [sessionId, ana.id],
        )) as [unknown[], number],
        (await manager.query('DELETE FROM participacion WHERE sesion_edicion_id = $1', [
          sessionId,
        ])) as [unknown[], number],
      ]);
      const foreignJoin = () =>
        app.asActor(asClient(bruno.id), (manager) =>
          manager.query(
            'INSERT INTO participacion (sesion_edicion_id, usuario_id, entro_en) VALUES ($1, $2, now())',
            [sessionId, carla.id],
          ),
        );

      expect(seen).toEqual([{ n: 1 }]);
      expect([others[1], updated[1]]).toEqual([0, 0]);
      await expect(foreignJoin()).rejects.toThrow(/row-level security/);
      expect(await participantsOf(sessionId ?? '')).toEqual([
        { usuario_id: ana.id, salio_en: null },
      ]);
    });

    it('el Lector, un tercero, el Editor revocado y un rol interno no ven la sesión', async () => {
      const editor = await sharedDocx('EDITOR');
      const viewer = await storage().newClient();
      const carla = await storage().newClient();
      const admin = await storage().newClient(Role.ADMIN);
      await insertShare(owner(), {
        ownerId: editor.ana.id,
        granteeId: viewer.id,
        node: { fileId: editor.fileId },
      });
      await openBody(editor.ana, editor.fileId);
      const before = await sessionCount(asClient(editor.bruno.id), editor.fileId);

      await revoke(editor.shareId);

      expect(before).toBe(1);
      for (const actor of [
        asClient(editor.bruno.id),
        asClient(viewer.id),
        asClient(carla.id),
        createActor(admin.id, Role.ADMIN),
      ]) {
        expect(await sessionCount(actor, editor.fileId)).toBe(0);
      }
    });
  });
});
