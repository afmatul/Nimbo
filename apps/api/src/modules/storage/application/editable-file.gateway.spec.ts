import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';

import {
  FakeNodeRepository,
  FakeObjectStorage,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { FakeVersionRepository, seedVersionedFile } from '../../../../test/support/version-fakes';
import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';

import { EditableFileGateway } from './editable-file.gateway';
import type { EditedVersionRegistrar } from './edited-version.registrar';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const BRUNO: Actor = createActor('22222222-2222-4222-8222-222222222222', Role.CLIENT);

const readAll = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
};

function setup() {
  const journal = new Journal();
  const nodes = new FakeNodeRepository(journal);
  const versions = new FakeVersionRepository(journal);
  const objects = new FakeObjectStorage(journal);
  const registrar = { register: jest.fn() };
  const gateway = new EditableFileGateway(
    new FakeTransactionRunner(journal),
    nodes,
    versions,
    objects,
    registrar as unknown as EditedVersionRegistrar,
  );
  const file = seedVersionedFile({ nodes, versions, objects }, ANA, [100n, 250n]);
  return { gateway, registrar, objects, versions, file };
}

describe('EditableFileGateway (fachada de `storage` para `editing`, plan 016 §2)', () => {
  it('CA-1: `find` da nombre, tipo, tamaño, propietaria y versión vigente del archivo vivo, sin clave', async () => {
    const { gateway, file } = setup();

    await expect(gateway.find(ANA, file.id)).resolves.toEqual({
      id: file.id,
      ownerId: ANA.id,
      name: 'secreto-7f3a.docx',
      kind: 'docx',
      sizeBytes: 250n,
      currentVersionId: file.currentVersionId,
    });
  });

  it('CA-2: `find` responde `null` para un archivo ajeno o inexistente', async () => {
    const { gateway, file } = setup();

    await expect(gateway.find(BRUNO, file.id)).resolves.toBeNull();
    await expect(gateway.find(ANA, randomUUID())).resolves.toBeNull();
  });

  it('CA-1: `openContent` entrega el contenido de la versión vigente', async () => {
    const { gateway, file, objects, versions } = setup();
    const current = versions.versions.get(file.currentVersionId);
    objects.objects.set(current?.objectKey.value ?? '', Buffer.from('versión vigente'));

    const stream = await gateway.openContent(ANA, file.id);

    await expect(readAll(stream as Readable)).resolves.toEqual(Buffer.from('versión vigente'));
  });

  it('CA-2: `openContent` responde `null` sin acceso o si el objeto ya no existe', async () => {
    const { gateway, file, objects } = setup();

    await expect(gateway.openContent(BRUNO, file.id)).resolves.toBeNull();
    objects.objects.clear();
    await expect(gateway.openContent(ANA, file.id)).resolves.toBeNull();
  });

  it('CA-9: `registerEditedVersion` delega en el registrador con el mismo actor', async () => {
    const { gateway, registrar, file } = setup();
    const outcome = { status: 'corrupt' };
    registrar.register.mockResolvedValue(outcome);
    const input = { fileId: file.id } as never;

    await expect(gateway.registerEditedVersion(ANA, input)).resolves.toBe(outcome);
    expect(registrar.register).toHaveBeenCalledWith(ANA, input);
  });
});
