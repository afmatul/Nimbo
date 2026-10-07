import { DOWNLOAD_URL_TTL_SECONDS } from '@nimbo/contracts';

import {
  FakeNodeRepository,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { createActor, FixedClock, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { NodeNotFoundError } from '../domain/errors';
import { File } from '../domain/file';
import { FileName } from '../domain/file-name.vo';

import { AccessibleFileUrlIssuer } from './accessible-file-url-issuer';
import type { IObjectStorage, PresignDownloadInput } from './ports/i-object-storage.port';

const NOW = new Date('2026-10-06T10:00:00.000Z');
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const FILE_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '33333333-3333-4333-8333-333333333333';
const OWNER: Actor = createActor(OWNER_ID, Role.CLIENT);
const SIGNED_URL = 'https://s3.nimbo.test/bucket/u/obj?X-Amz-Signature=abc';
const MS_PER_SECOND = 1000;

const FILE = File.create({
  id: FILE_ID,
  ownerId: OWNER_ID,
  folderId: null,
  name: FileName.of('Informe final.pdf'),
  kind: 'pdf',
  sizeBytes: 1_024n,
  currentVersionId: VERSION_ID,
  now: NOW,
});

/** Firmador que anota cada petición en el diario; `failure` simula un MinIO caído. */
function fakeSigner(journal: Journal, failure?: Error) {
  const presigned: PresignDownloadInput[] = [];
  const presignDownload = (input: PresignDownloadInput): Promise<string> => {
    journal.add('storage:presignDownload');
    presigned.push(input);
    return failure === undefined ? Promise.resolve(SIGNED_URL) : Promise.reject(failure);
  };
  return { signer: { presignDownload } as unknown as IObjectStorage, presigned };
}

function setup(failure?: Error) {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const nodes = new FakeNodeRepository(journal);
  nodes.files.set(FILE.id, FILE);
  const { signer, presigned } = fakeSigner(journal, failure);
  const issuer = new AccessibleFileUrlIssuer(transactions, nodes, signer, new FixedClock(NOW));
  return { issuer, journal, presigned };
}

describe('AccessibleFileUrlIssuer', () => {
  it('005 CA-16: resuelve el archivo dentro de `withActor` y firma después, fuera de la transacción', async () => {
    const { issuer, journal } = setup();

    await issuer.issue(OWNER, FILE_ID);

    expect(journal.entries).toEqual([
      'tx:begin',
      'nodes:findAccessibleById',
      'tx:end',
      'storage:presignDownload',
    ]);
  });

  it('005 CA-13, 017 CA-11: firma la versión actual por 300 s con la política de descarga', async () => {
    const { issuer, presigned } = setup();

    const issued = await issuer.issue(OWNER, FILE_ID);

    expect(presigned).toEqual([
      {
        key: `u/${OWNER_ID}/${FILE_ID}/${VERSION_ID}`,
        fileName: 'Informe final.pdf',
        expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
      },
    ]);
    expect(issued).toEqual({
      file: FILE,
      url: SIGNED_URL,
      expiresAt: new Date(NOW.getTime() + DOWNLOAD_URL_TTL_SECONDS * MS_PER_SECOND),
    });
  });

  it('005 CA-16: ajeno e inexistente son el mismo `NodeNotFoundError`, sin firmar', async () => {
    const { issuer, presigned } = setup();
    const stranger = createActor('44444444-4444-4444-8444-444444444444', Role.CLIENT);

    await expect(issuer.issue(stranger, FILE_ID)).rejects.toThrow(NodeNotFoundError);
    await expect(issuer.issue(OWNER, '55555555-5555-4555-8555-555555555555')).rejects.toThrow(
      NodeNotFoundError,
    );
    expect(presigned).toEqual([]);
  });

  it('017 CA-11: si la condición del llamador rechaza el archivo, no se firma', async () => {
    const { issuer, presigned } = setup();
    const rejection = new Error('no admitido');

    const attempt = issuer.issue(OWNER, FILE_ID, () => {
      throw rejection;
    });

    await expect(attempt).rejects.toBe(rejection);
    expect(presigned).toEqual([]);
  });

  it('017 CA-11: un fallo al firmar se propaga tal cual, sin envolverlo', async () => {
    const failure = new Error('minio caído');
    const { issuer } = setup(failure);

    await expect(issuer.issue(OWNER, FILE_ID)).rejects.toBe(failure);
  });
});
