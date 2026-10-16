import { randomUUID } from 'node:crypto';

import { I_USER_DIRECTORY } from '../../../src/modules/editing';
import type { IUserDirectory } from '../../../src/modules/editing';
import { collectEvents, settle } from '../realtime/realtime-test-app';
import type { StorageClient } from '../storage/storage-http';

import { uploadDocx } from './edited-version-world';
import { createEditingHttpApp } from './editing-http';
import type { EditingHttpApp } from './editing-http';

/**
 * Los nombres de la presencia los pone el servidor (016 RN-12, CA-6, DF-74): salen de `IUserDirectory`, que
 * implementa `identity` leyendo solo `usuario.nombre`; el cliente no puede mandar el suyo.
 */
describe('nombres visibles desde `IUserDirectory` (016 CA-6, RN-12)', () => {
  let editing: EditingHttpApp;

  beforeAll(async () => {
    editing = await createEditingHttpApp();
  });

  afterAll(async () => {
    await editing?.close();
  });

  const storage = () => editing.storage;

  const rename = async (client: StorageClient, name: string): Promise<void> => {
    await storage().owner.query('UPDATE usuario SET nombre = $1 WHERE id = $2', [name, client.id]);
  };

  it('RN-12: el adaptador de `identity` devuelve solo `id → nombre` de las cuentas pedidas', async () => {
    const ana = await storage().newClient();
    const bea = await storage().newClient();
    const unrelated = await storage().newClient();
    await rename(bea, 'Bea Ruiz');
    const directory = storage().testApp.app.get<IUserDirectory>(I_USER_DIRECTORY);

    const names = await directory.displayNames([ana.id, bea.id, randomUUID()]);

    expect([...names.entries()].sort()).toEqual(
      [
        [ana.id, 'Ana López'],
        [bea.id, 'Bea Ruiz'],
      ].sort(),
    );
    expect(names.has(unrelated.id)).toBe(false);
  });

  it('CA-6: la lista y el editor muestran el nombre de la cuenta, no uno que mande el cliente', async () => {
    const ana = await storage().newClient();
    await rename(ana, 'Ana Pérez');
    const { fileId } = await uploadDocx(storage(), ana);
    const socket = await editing.connect(ana.id);
    const seen = collectEvents(socket, 'editing.presence');

    const spoofed = await editing.open(ana, fileId, {
      connectionId: socket.id,
      displayName: 'Bea Ruiz',
    });
    const opened = await editing.open(ana, fileId, { connectionId: socket.id });
    await settle();

    const shown = [{ userId: ana.id, displayName: 'Ana Pérez' }];
    expect(spoofed.status).toBe(400);
    expect(opened.body).toMatchObject({
      participants: shown,
      config: { editorConfig: { user: { id: ana.id, name: 'Ana Pérez' } } },
    });
    expect(seen).toEqual([{ participants: shown, editors: 1, maxEditors: 3 }]);
  });
});
