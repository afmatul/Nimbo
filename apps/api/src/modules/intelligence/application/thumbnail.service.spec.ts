import { Readable } from 'node:stream';

import type { Actor } from '../../../shared';
import { NodeNotFoundError } from '../../storage';
import type { IndexableFile } from '../../storage';
import { NotIndexableError } from '../domain/errors';

import type { ExtractorRegistry } from './extractor-registry';
import type { IThumbnailRepository } from './ports/i-thumbnail-repository.port';
import { THUMBNAIL_MAX_FILE_BYTES, ThumbnailService } from './thumbnail.service';

const BRUNO = { id: 'bruno', role: 'CLIENT' } as unknown as Actor;
const FILE: IndexableFile = {
  id: 'f1',
  ownerId: 'ana',
  kind: 'docx',
  sizeBytes: 1000n,
  currentVersionId: 'v1',
};

function setup(file: IndexableFile | null = FILE) {
  const files = {
    findAccessible: jest.fn().mockResolvedValue(file),
    openCurrent: jest.fn().mockImplementation(() => Promise.resolve(Readable.from(['zip']))),
  };
  const extract = jest.fn().mockResolvedValue([{ text: 'Acta de reunión' }]);
  const extractors = { forKind: jest.fn().mockReturnValue({ extract }) };
  const thumbnails: jest.Mocked<IThumbnailRepository> = {
    find: jest.fn().mockResolvedValue(null),
    insertIfAbsent: jest.fn().mockResolvedValue(undefined),
  };
  const transactions = { withActor: jest.fn((_actor: Actor, work: () => unknown) => work()) };
  const logger = { warn: jest.fn() };
  const service = new ThumbnailService(
    files as never,
    extractors as unknown as ExtractorRegistry,
    thumbnails,
    transactions as never,
    { now: () => new Date('2026-11-12T10:00:00Z') },
    logger as never,
  );
  return { service, files, extract, thumbnails, transactions, logger };
}

describe('ThumbnailService', () => {
  it('un archivo que el actor no ve (ajeno, inexistente o en la papelera) es NodeNotFoundError', async () => {
    const { service, thumbnails } = setup(null);
    await expect(service.excerptOf(BRUNO, 'f1')).rejects.toBeInstanceOf(NodeNotFoundError);
    expect(thumbnails.find).not.toHaveBeenCalled();
  });

  it('comprueba el acceso con el actor y lee y guarda como la propietaria', async () => {
    const { service, files, thumbnails, transactions } = setup();
    await service.excerptOf(BRUNO, 'f1');
    expect(files.findAccessible).toHaveBeenCalledWith(BRUNO, 'f1');
    const [owner] = transactions.withActor.mock.calls[0] ?? [];
    expect(owner).toMatchObject({ id: 'ana', role: 'CLIENT' });
    expect(thumbnails.insertIfAbsent).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ fileId: 'f1', versionId: 'v1', text: 'Acta de reunión' }),
    );
  });

  it('genera el extracto la primera vez y lo reutiliza después sin leer el archivo', async () => {
    const { service, files, thumbnails } = setup();
    expect(await service.excerptOf(BRUNO, 'f1')).toBe('Acta de reunión');
    thumbnails.find.mockResolvedValue({ text: 'Acta de reunión' });
    expect(await service.excerptOf(BRUNO, 'f1')).toBe('Acta de reunión');
    expect(files.openCurrent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no es .docx', { ...FILE, kind: 'pdf' as const }],
    ['es demasiado grande', { ...FILE, sizeBytes: THUMBNAIL_MAX_FILE_BYTES + 1n }],
  ])('si %s, devuelve null sin leerlo', async (_name, file) => {
    const { service, files } = setup(file as IndexableFile);
    expect(await service.excerptOf(BRUNO, 'f1')).toBeNull();
    expect(files.openCurrent).not.toHaveBeenCalled();
  });

  it('un documento dañado devuelve null, se guarda como «sin texto» y registra solo la clase del error', async () => {
    const { service, extract, thumbnails, logger } = setup();
    extract.mockRejectedValue(new NotIndexableError('formato_no_soportado'));
    expect(await service.excerptOf(BRUNO, 'f1')).toBeNull();
    expect(thumbnails.insertIfAbsent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ text: null }),
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('Acta');
  });

  it('un documento sin texto devuelve null y lo guarda para no leerlo otra vez', async () => {
    const { service, extract, thumbnails, files } = setup();
    extract.mockResolvedValue([{ text: '  ' }]);
    expect(await service.excerptOf(BRUNO, 'f1')).toBeNull();
    expect(thumbnails.insertIfAbsent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ text: null }),
    );

    thumbnails.find.mockResolvedValue({ text: null });
    expect(await service.excerptOf(BRUNO, 'f1')).toBeNull();
    expect(files.openCurrent).toHaveBeenCalledTimes(1);
  });

  it('un fallo transitorio (error de lectura u objeto ausente) devuelve null y no se guarda', async () => {
    const { service, extract, files, thumbnails, logger } = setup();
    extract.mockRejectedValue(new RangeError('contenido secreto'));
    expect(await service.excerptOf(BRUNO, 'f1')).toBeNull();
    files.openCurrent.mockResolvedValue(null);
    expect(await service.excerptOf(BRUNO, 'f1')).toBeNull();
    expect(thumbnails.insertIfAbsent).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('secreto');
  });
});
