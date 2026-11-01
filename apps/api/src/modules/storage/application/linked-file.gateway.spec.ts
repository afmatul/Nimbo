import { randomUUID } from 'node:crypto';

import {
  FakeNodeRepository,
  FakeObjectStorage,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { FakeVersionRepository, seedVersionedFile } from '../../../../test/support/version-fakes';
import { createActor, Role } from '../../../shared';
import type { Actor } from '../../../shared';

import { LinkedFileGateway } from './linked-file.gateway';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const BRUNO: Actor = createActor('22222222-2222-4222-8222-222222222222', Role.CLIENT);

function setup() {
  const journal = new Journal();
  const nodes = new FakeNodeRepository(journal);
  const versions = new FakeVersionRepository(journal);
  const objects = new FakeObjectStorage(journal);
  const gateway = new LinkedFileGateway(new FakeTransactionRunner(journal), nodes);
  const file = seedVersionedFile({ nodes, versions, objects }, ANA, [100n, 250n]);
  return { gateway, journal, file };
}

describe('LinkedFileGateway (fachada de `storage` para `sharing`, plan 013 §2)', () => {
  it('CA-1: `findOwnedFile` da id, nombre y tamaño del archivo propio y vivo, por `findOwnedLiveFile`', async () => {
    const { gateway, journal, file } = setup();

    await expect(gateway.findOwnedFile(ANA, file.id)).resolves.toEqual({
      id: file.id,
      name: 'secreto-7f3a.docx',
      sizeBytes: 250n,
    });
    expect(journal.entries).toContain('nodes:findOwnedLiveFile');
  });

  it('CA-3: `findOwnedFile` responde `null` para un archivo ajeno o inexistente (papelera y carpeta: int)', async () => {
    const { gateway, file } = setup();

    await expect(gateway.findOwnedFile(BRUNO, file.id)).resolves.toBeNull();
    await expect(gateway.findOwnedFile(ANA, randomUUID())).resolves.toBeNull();
  });
});
