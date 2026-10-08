import { File, type CreateFileInput } from './file';
import { FileName } from './file-name.vo';
import { FileVersion, type NewVersionInput } from './file-version';
import { ObjectKey } from './object-key';
import { TrashState } from './trash-state';

const OWNER = '11111111-1111-4111-8111-111111111111';
const FILE = '22222222-2222-4222-8222-222222222222';
const VERSION = '33333333-3333-4333-8333-333333333333';
const FOLDER = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-09-30T10:00:00.000Z');

function fileInput(overrides: Partial<CreateFileInput> = {}): CreateFileInput {
  return {
    id: FILE,
    ownerId: OWNER,
    folderId: null,
    name: FileName.of('informe.docx'),
    kind: 'docx',
    sizeBytes: 2048n,
    currentVersionId: VERSION,
    now: NOW,
    ...overrides,
  };
}

function versionInput(overrides: Partial<NewVersionInput> = {}): NewVersionInput {
  return {
    id: VERSION,
    fileId: FILE,
    objectKey: ObjectKey.of(OWNER, FILE, VERSION),
    sizeBytes: 2048n,
    createdBy: OWNER,
    number: 1,
    now: NOW,
    ...overrides,
  };
}

describe('File', () => {
  it('CA-1: se crea en la raíz, sin papelera y con su versión actual', () => {
    const file = File.create(fileInput());

    expect(file.name.value).toBe('informe.docx');
    expect(file.kind).toBe('docx');
    expect(file.sizeBytes).toBe(2048n);
    expect(file.currentVersionId).toBe(VERSION);
    expect(file.createdAt).toEqual(NOW);
    expect(file.updatedAt).toEqual(NOW);
    expect(file.type).toBe('file');
    expect(file.folderId).toBeNull();
    expect(file.trash).toBeNull();
  });

  it('CA-6 (006): se crea dentro de la carpeta destino', () => {
    expect(File.create(fileInput({ folderId: FOLDER })).folderId).toBe(FOLDER);
  });

  it('CA-10 (006): `rehydrate` conserva el estado de papelera', () => {
    const trash = TrashState.start(NOW, 30).carriedBy(FOLDER);
    const file = File.rehydrate({
      ...File.create(fileInput()).snapshot(),
      folderId: FOLDER,
      trash,
    });

    expect(file.trash).toBe(trash);
    expect(File.rehydrate(file.snapshot()).snapshot()).toEqual(file.snapshot());
  });

  it.each([0n, -1n])('CA-7: `tamanoBytes` debe ser > 0 (%s)', (sizeBytes) => {
    expect(() => File.create(fileInput({ sizeBytes }))).toThrow(TypeError);
  });

  it('`rehydrate` reconstruye el mismo estado', () => {
    const file = File.create(fileInput());

    expect(File.rehydrate(file.snapshot()).snapshot()).toEqual(file.snapshot());
  });

  it('es inmutable', () => {
    expect(Object.isFrozen(File.create(fileInput()))).toBe(true);
  });
});

describe('FileVersion', () => {
  it('CA-1: una carga crea una versión con origen `carga`', () => {
    const version = FileVersion.fromUpload(versionInput());

    expect(version.origin).toBe('carga');
    expect(version.sizeBytes).toBe(2048n);
    expect(version.createdBy).toBe(OWNER);
    expect(version.createdAt).toEqual(NOW);
  });

  it.each([0n, -5n])('CA-7: `tamanoBytes` debe ser > 0 (%s)', (sizeBytes) => {
    expect(() => FileVersion.fromUpload(versionInput({ sizeBytes }))).toThrow(TypeError);
  });

  it('`rehydrate` admite los cuatro orígenes del CHECK', () => {
    const base = FileVersion.fromUpload(versionInput()).snapshot();

    for (const origin of ['carga', 'edicion', 'restauracion', 'optimizacion'] as const) {
      expect(FileVersion.rehydrate({ ...base, origin }).origin).toBe(origin);
    }
  });

  it('es inmutable', () => {
    expect(Object.isFrozen(FileVersion.fromUpload(versionInput()))).toBe(true);
  });

  it('CA-5: una carga guarda su número y no viene de una restauración', () => {
    const version = FileVersion.fromUpload(versionInput({ number: 4 }));

    expect(version.number).toBe(4);
    expect(version.restoredFromNumber).toBeNull();
    expect(version.snapshot()).toMatchObject({ number: 4, restoredFromNumber: null });
  });

  it.each([0, -1, 1.5])('RN-4: el número debe ser un entero positivo (%s)', (number) => {
    expect(() => FileVersion.fromUpload(versionInput({ number }))).toThrow(TypeError);
  });

  it('CA-9: restaurar crea una versión nueva `restauracion` con el contenido y el número de la de origen', () => {
    const source = FileVersion.fromUpload(versionInput({ number: 2, sizeBytes: 900n }));
    const restoredId = '55555555-5555-4555-8555-555555555555';
    const objectKey = ObjectKey.of(OWNER, FILE, restoredId);

    const restored = FileVersion.fromRestoration(source, {
      id: restoredId,
      objectKey,
      createdBy: OWNER,
      number: 5,
      now: NOW,
    });

    expect(restored.origin).toBe('restauracion');
    expect(restored.fileId).toBe(FILE);
    expect(restored.sizeBytes).toBe(900n);
    expect(restored.number).toBe(5);
    expect(restored.restoredFromNumber).toBe(2);
    expect(restored.objectKey.equals(objectKey)).toBe(true);
    expect(source.number).toBe(2);
  });

  it('ck_version_numero: la versión de origen debe tener un número menor', () => {
    const source = FileVersion.fromUpload(versionInput({ number: 3 }));
    const restoration = {
      id: VERSION,
      objectKey: ObjectKey.of(OWNER, FILE, VERSION),
      createdBy: OWNER,
      number: 3,
      now: NOW,
    };

    expect(() => FileVersion.fromRestoration(source, restoration)).toThrow(TypeError);
  });

  it.each(['edicion', 'optimizacion'] as const)(
    'CA-5: `forOrigin` registra una versión `%s` con la misma forma que una carga',
    (origin) => {
      const version = FileVersion.forOrigin(origin, versionInput({ number: 7 }));

      expect(version.origin).toBe(origin);
      expect(version.number).toBe(7);
      expect(version.restoredFromNumber).toBeNull();
    },
  );

  it('`rehydrate` reconstruye el número y la versión de origen', () => {
    const snapshot = {
      ...FileVersion.fromUpload(versionInput({ number: 6 })).snapshot(),
      origin: 'restauracion' as const,
      restoredFromNumber: 2,
    };

    expect(FileVersion.rehydrate(snapshot).snapshot()).toEqual(snapshot);
  });
});
