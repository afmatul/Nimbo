import { FakeTransactionRunner, Journal } from '../../../../../test/support/storage-fakes';
import { createActor, Role } from '../../../../shared';
import type { Actor } from '../../../../shared';
import { File } from '../../domain/file';
import { FileName } from '../../domain/file-name.vo';
import { Folder } from '../../domain/folder';
import { FolderName } from '../../domain/folder-name.vo';

import type {
  INodeSearchRepository,
  NodeSearchCriteria,
  SearchPage,
} from './ports/i-node-search.repository.port';
import { SearchService } from './search.service';

const ANA: Actor = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const FOLDER_ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const FILE_ID = '3f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const AT = new Date('2026-09-30T10:00:00.000Z');
const FROM = '2026-10-01T06:00:00.000Z';
const TO = '2026-10-08T06:00:00.000Z';

/** Doble del repositorio: guarda lo pedido y devuelve `page`. */
class FakeNodeSearchRepository implements INodeSearchRepository {
  readonly asked: { actor: Actor; criteria: NodeSearchCriteria }[] = [];
  page: SearchPage = { hits: [], nextCursor: null };

  constructor(private readonly journal: Journal) {}

  search(actor: Actor, criteria: NodeSearchCriteria): Promise<SearchPage> {
    this.journal.add('search');
    this.asked.push({ actor, criteria });
    return Promise.resolve(this.page);
  }
}

function setup() {
  const journal = new Journal();
  const transactions = new FakeTransactionRunner(journal);
  const repository = new FakeNodeSearchRepository(journal);
  const service = new SearchService(transactions, repository);
  const lastCriteria = (): NodeSearchCriteria | undefined => repository.asked.at(-1)?.criteria;
  return { journal, transactions, repository, service, lastCriteria };
}

const folder = Folder.create({
  id: FOLDER_ID,
  ownerId: ANA.id,
  name: FolderName.of('Informes'),
  parent: null,
  maxDepth: 3,
  now: AT,
});

const file = File.create({
  id: FILE_ID,
  ownerId: ANA.id,
  folderId: FOLDER_ID,
  name: FileName.of('Informe del Camión.docx'),
  kind: 'docx',
  sizeBytes: 1024n,
  currentVersionId: '4f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
  now: AT,
});

describe('SearchService', () => {
  it('CA-1: busca dentro de `withActor` del actor, con la página pedida', async () => {
    const { journal, transactions, repository, service } = setup();

    await service.search(ANA, { q: 'camion', limit: 50, cursor: 'abc' });

    expect(journal.entries).toEqual(['tx:begin', 'search', 'tx:end']);
    expect(transactions.actors).toEqual([ANA.id]);
    expect(repository.asked[0]).toEqual({
      actor: ANA,
      criteria: { terms: ['camion'], limit: 50, cursor: 'abc' },
    });
  });

  it('CA-1: divide el texto en palabras por espacios, sin repetidas', async () => {
    const { service, lastCriteria } = setup();

    await service.search(ANA, { q: ' camion \t informe  camion ', limit: 50 });

    expect(lastCriteria()?.terms).toEqual(['camion', 'informe']);
  });

  it('CA-1: normaliza a NFC, así «camión» escrito con tilde combinable es la misma palabra', async () => {
    const { service, lastCriteria } = setup();

    await service.search(ANA, { q: 'camión camión', limit: 50 });

    expect(lastCriteria()?.terms).toEqual(['camión']);
  });

  it.each([
    ['documents', ['docx', 'pdf', 'texto', 'xlsx', 'pptx']],
    ['images', ['imagen']],
    ['other', ['otro']],
  ] as const)('CA-7: el tipo `%s` son los archivos %j', async (type, kinds) => {
    const { service, lastCriteria } = setup();

    await service.search(ANA, { q: 'a', type, limit: 50 });

    expect(lastCriteria()?.kinds).toEqual(kinds);
  });

  it('CA-7: sin tipo no acota por tipo (las carpetas entran)', async () => {
    const { service, lastCriteria } = setup();

    await service.search(ANA, { q: 'a', limit: 50 });

    expect(lastCriteria()).not.toHaveProperty('kinds');
  });

  it('CA-8: `from` y `to` pasan como instantes; ausentes, no acotan', async () => {
    const { service, lastCriteria } = setup();

    await service.search(ANA, { q: 'a', from: FROM, to: TO, limit: 50 });
    expect(lastCriteria()).toMatchObject({ from: new Date(FROM), to: new Date(TO) });

    await service.search(ANA, { q: 'a', from: FROM, limit: 50 });
    expect(lastCriteria()).not.toHaveProperty('to');
  });

  it('CA-2: cada resultado es su `NodeSummary` con la ubicación (`null` = «Mis archivos»)', async () => {
    const { repository, service } = setup();
    repository.page = {
      hits: [
        { node: folder, location: null, matchedBy: 'name' },
        { node: file, location: { id: FOLDER_ID, name: 'Informes' }, matchedBy: 'name' },
      ],
      nextCursor: 'siguiente',
    };

    const response = await service.search(ANA, { q: 'informe', limit: 50 });

    expect(response).toEqual({
      items: [
        {
          type: 'folder',
          id: FOLDER_ID,
          name: 'Informes',
          parentId: null,
          createdAt: AT.toISOString(),
          updatedAt: AT.toISOString(),
          location: null,
          shared: false,
        },
        {
          type: 'file',
          id: FILE_ID,
          name: 'Informe del Camión.docx',
          sizeBytes: 1024,
          kind: 'docx',
          folderId: FOLDER_ID,
          createdAt: AT.toISOString(),
          updatedAt: AT.toISOString(),
          location: { id: FOLDER_ID, name: 'Informes' },
          shared: false,
          matchedBy: 'name',
        },
      ],
      nextCursor: 'siguiente',
    });
  });

  describe('lo compartido por otra cuenta (012, PD-148 y PD-152)', () => {
    const OWNER_ID = '99999999-9999-4999-8999-999999999999';
    const sharedFile = File.create({
      id: FILE_ID,
      ownerId: OWNER_ID,
      folderId: FOLDER_ID,
      name: FileName.of('Plan compartido.docx'),
      kind: 'docx',
      sizeBytes: 1024n,
      currentVersionId: '4f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
      now: AT,
    });
    const ownersRoot = Folder.create({
      id: '5f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
      ownerId: OWNER_ID,
      name: FolderName.of('Cuenta'),
      parent: null,
      maxDepth: 3,
      now: AT,
    });
    const sharedFolder = Folder.create({
      id: FOLDER_ID,
      ownerId: OWNER_ID,
      name: FolderName.of('Proyectos'),
      parent: ownersRoot,
      maxDepth: 3,
      now: AT,
    });

    const searchWith = async (hits: SearchPage['hits']) => {
      const { repository, service } = setup();
      repository.page = { hits, nextCursor: null };
      return (await service.search(ANA, { q: 'plan', limit: 50 })).items;
    };

    it('CA-2: lo que no es del actor sale con `shared`; lo propio, no', async () => {
      const [own, other] = await searchWith([
        { node: file, location: { id: FOLDER_ID, name: 'Informes' }, matchedBy: 'name' },
        { node: sharedFile, location: { id: FOLDER_ID, name: 'Proyectos' }, matchedBy: 'name' },
      ]);

      expect([own?.shared, other?.shared]).toEqual([false, true]);
    });

    it('CA-13: sin ubicación visible, el archivo sale sin `folderId` (no delata la carpeta)', async () => {
      const [hit] = await searchWith([{ node: sharedFile, location: null, matchedBy: 'name' }]);

      expect(hit).toMatchObject({ type: 'file', folderId: null, location: null, shared: true });
    });

    it('CA-13: sin ubicación visible, la carpeta sale sin `parentId`', async () => {
      const [hit] = await searchWith([{ node: sharedFolder, location: null, matchedBy: 'name' }]);

      expect(hit).toMatchObject({ type: 'folder', parentId: null, location: null, shared: true });
    });

    it('CA-13: con ubicación visible se conserva el padre', async () => {
      const [hit] = await searchWith([
        { node: sharedFile, location: { id: FOLDER_ID, name: 'Proyectos' }, matchedBy: 'name' },
      ]);

      expect(hit).toMatchObject({ type: 'file', folderId: FOLDER_ID, shared: true });
    });
  });
});
