import { DOWNLOAD_URL_TTL_SECONDS } from '@nimbo/contracts';

import {
  FakeNodeRepository,
  FakeTransactionRunner,
  Journal,
} from '../../../../test/support/storage-fakes';
import { createActor, FixedClock, InsufficientRoleError, Role } from '../../../shared';
import type { Actor } from '../../../shared';
import { NodeNotFoundError, PreviewUnsupportedError } from '../domain/errors';
import { File } from '../domain/file';
import type { FileKind } from '../domain/file-kind';
import { FileName } from '../domain/file-name.vo';

import { AccessibleFileUrlIssuer } from './accessible-file-url-issuer';
import type { IObjectStorage, PresignDownloadInput } from './ports/i-object-storage.port';
import { StoragePreviewFacade } from './storage-preview.facade';

const NOW = new Date('2026-10-06T10:00:00.000Z');
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const FILE_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '33333333-3333-4333-8333-333333333333';
const FOLDER_ID = '66666666-6666-4666-8666-666666666666';
const OWNER: Actor = createActor(OWNER_ID, Role.CLIENT);
const SIGNED_URL = 'https://s3.nimbo.test/bucket/u/obj?X-Amz-Signature=abc';
const MS_PER_SECOND = 1000;

const fileOf = (kind: FileKind, name: string): File =>
  File.create({
    id: FILE_ID,
    ownerId: OWNER_ID,
    folderId: FOLDER_ID,
    name: FileName.of(name),
    kind,
    sizeBytes: 4_096n,
    currentVersionId: VERSION_ID,
    now: NOW,
  });

function setup(file: File, signingFailure?: Error) {
  const journal = new Journal();
  const nodes = new FakeNodeRepository(journal);
  nodes.files.set(file.id, file);
  const presigned: PresignDownloadInput[] = [];
  const presignDownload = (input: PresignDownloadInput): Promise<string> => {
    journal.add('storage:presignDownload');
    presigned.push(input);
    return signingFailure === undefined
      ? Promise.resolve(SIGNED_URL)
      : Promise.reject(signingFailure);
  };
  const issuer = new AccessibleFileUrlIssuer(
    new FakeTransactionRunner(journal),
    nodes,
    { presignDownload } as unknown as IObjectStorage,
    new FixedClock(NOW),
  );
  return { facade: new StoragePreviewFacade(issuer), journal, presigned };
}

describe('StoragePreviewFacade.issueUrl', () => {
  it.each<[FileKind, string]>([
    ['pdf', 'Informe.pdf'],
    ['xlsx', 'Cuentas.xlsx'],
    ['pptx', 'Charla.pptx'],
    ['texto', 'Notas.md'],
    ['imagen', 'Foto.webp'],
  ])(
    'CA-1, CA-11: un `%s` recibe la URL de 300 s y el `FileSummary` del archivo',
    async (kind, name) => {
      const { facade } = setup(fileOf(kind, name));

      const delivery = await facade.issueUrl(OWNER, FILE_ID);

      expect(delivery).toEqual({
        file: {
          id: FILE_ID,
          name,
          kind,
          folderId: FOLDER_ID,
          sizeBytes: 4_096,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
        },
        url: SIGNED_URL,
        expiresAt: new Date(NOW.getTime() + DOWNLOAD_URL_TTL_SECONDS * MS_PER_SECOND),
      });
    },
  );

  it('CA-11: firma igual que la descarga de 005 (`presignDownload`, versión actual, 300 s)', async () => {
    const { facade, presigned } = setup(fileOf('pdf', 'Informe.pdf'));

    await facade.issueUrl(OWNER, FILE_ID);

    expect(DOWNLOAD_URL_TTL_SECONDS).toBe(300);
    expect(presigned).toEqual([
      {
        key: `u/${OWNER_ID}/${FILE_ID}/${VERSION_ID}`,
        fileName: 'Informe.pdf',
        expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
      },
    ]);
  });

  it('CA-8: no consume la tasa de descarga ni audita la emisión como descarga', async () => {
    const { facade, journal } = setup(fileOf('pdf', 'Informe.pdf'));

    await facade.issueUrl(OWNER, FILE_ID);

    expect(journal.entries).toEqual([
      'tx:begin',
      'nodes:findAccessibleById',
      'tx:end',
      'storage:presignDownload',
    ]);
  });

  it.each<[FileKind, string]>([
    ['docx', 'Contrato.docx'],
    ['otro', 'Logo.svg'],
  ])('CA-11: un `%s` es `PreviewUnsupportedError` (422) sin firmar', async (kind, name) => {
    const { facade, presigned } = setup(fileOf(kind, name));

    const error = await facade.issueUrl(OWNER, FILE_ID).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PreviewUnsupportedError);
    expect((error as PreviewUnsupportedError).status).toBe(422);
    expect((error as PreviewUnsupportedError).code).toBe('STORAGE_PREVIEW_UNSUPPORTED');
    expect(presigned).toEqual([]);
  });

  it('CA-3: ajeno e inexistente responden el mismo 404, aunque el ajeno no sea previsualizable', async () => {
    const { facade, presigned } = setup(fileOf('docx', 'Contrato.docx'));
    const stranger = createActor('44444444-4444-4444-8444-444444444444', Role.CLIENT);

    await expect(facade.issueUrl(stranger, FILE_ID)).rejects.toThrow(NodeNotFoundError);
    await expect(facade.issueUrl(OWNER, '55555555-5555-4555-8555-555555555555')).rejects.toThrow(
      NodeNotFoundError,
    );
    expect(presigned).toEqual([]);
  });

  it.each([Role.ADMIN, Role.SUPPORT, Role.OPERATOR])(
    'CA-4: el rol interno %s recibe 403 `SHARED_FORBIDDEN` sin buscar el archivo',
    async (role) => {
      const { facade, journal } = setup(fileOf('pdf', 'Informe.pdf'));

      const error = await facade
        .issueUrl(createActor(OWNER_ID, role), FILE_ID)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InsufficientRoleError);
      expect((error as InsufficientRoleError).code).toBe('SHARED_FORBIDDEN');
      expect(journal.entries).toEqual([]);
    },
  );

  it('CA-11: un fallo al firmar se propaga sin envolver', async () => {
    const failure = new Error('minio caído');
    const { facade } = setup(fileOf('pdf', 'Informe.pdf'), failure);

    await expect(facade.issueUrl(OWNER, FILE_ID)).rejects.toBe(failure);
  });
});
