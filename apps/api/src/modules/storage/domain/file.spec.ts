import { File, type CreateFileInput } from './file';
import { FileName } from './file-name.vo';
import { FileVersion, type UploadedVersionInput } from './file-version';
import { ObjectKey } from './object-key';

const OWNER = '11111111-1111-4111-8111-111111111111';
const FILE = '22222222-2222-4222-8222-222222222222';
const VERSION = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-09-30T10:00:00.000Z');

function fileInput(overrides: Partial<CreateFileInput> = {}): CreateFileInput {
  return {
    id: FILE,
    ownerId: OWNER,
    name: FileName.of('informe.docx'),
    kind: 'docx',
    sizeBytes: 2048n,
    currentVersionId: VERSION,
    now: NOW,
    ...overrides,
  };
}

function versionInput(overrides: Partial<UploadedVersionInput> = {}): UploadedVersionInput {
  return {
    id: VERSION,
    fileId: FILE,
    objectKey: ObjectKey.of(OWNER, FILE, VERSION),
    sizeBytes: 2048n,
    createdBy: OWNER,
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
    expect(file.deletedAt).toBeNull();
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
});
