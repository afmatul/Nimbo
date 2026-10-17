import { FixedClock } from '../../../shared/domain/fixed.clock';

import { FileName } from './file-name.vo';
import { ObjectKey } from './object-key';
import {
  InvalidUploadTransitionError,
  UPLOAD_TTL_HOURS,
  UploadSession,
  type StartUploadInput,
} from './upload-session';

const HOUR_MS = 3_600_000;
const OWNER = '11111111-1111-4111-8111-111111111111';
const FILE = '22222222-2222-4222-8222-222222222222';
const VERSION = '33333333-3333-4333-8333-333333333333';
const UPLOAD = '44444444-4444-4444-8444-444444444444';
const FOLDER = '55555555-5555-4555-8555-555555555555';

const clock = new FixedClock(new Date('2026-09-30T10:00:00.000Z'));

function input(overrides: Partial<StartUploadInput> = {}): StartUploadInput {
  return {
    id: UPLOAD,
    ownerId: OWNER,
    fileId: FILE,
    versionId: VERSION,
    folderId: null,
    name: FileName.of('informe.docx'),
    keepBoth: false,
    replacesFile: false,
    declaredBytes: 1024n,
    multipart: null,
    now: clock.now(),
    ...overrides,
  };
}

const start = (overrides: Partial<StartUploadInput> = {}): UploadSession =>
  UploadSession.start(input(overrides));

describe('UploadSession', () => {
  it('CA-1: nace `activa`, simple y con la clave final desde el inicio', () => {
    const session = start();

    expect(session.state).toBe('activa');
    expect(session.mode).toBe('simple');
    expect(session.objectKey.equals(ObjectKey.of(OWNER, FILE, VERSION))).toBe(true);
    expect(session.rejectionReason).toBeNull();
    expect(session.finishedAt).toBeNull();
  });

  it('CA-1 (014): una carga nueva no reemplaza ningún archivo', () => {
    expect(start().replacesFile).toBe(false);
    expect(start().snapshot().replacesFile).toBe(false);
  });

  it('CA-1 (014): un reemplazo guarda `replacesFile` y apunta al archivo existente', () => {
    const session = start({ replacesFile: true });

    expect(session.replacesFile).toBe(true);
    expect(session.fileId).toBe(FILE);
    expect(session.snapshot().replacesFile).toBe(true);
    expect(UploadSession.rehydrate(session.snapshot()).replacesFile).toBe(true);
  });

  it('CA-1 (014): `replacesFile` se conserva al terminar la carga', () => {
    expect(start({ replacesFile: true }).complete(clock.now()).replacesFile).toBe(true);
  });

  it('CA-6 (006): guarda la carpeta destino; `null` es la raíz', () => {
    expect(start().folderId).toBeNull();
    expect(start({ folderId: FOLDER }).folderId).toBe(FOLDER);
    expect(start({ folderId: FOLDER }).snapshot().folderId).toBe(FOLDER);
  });

  it('CA-2: con datos de multipart es `por_partes`', () => {
    const session = start({
      multipart: { uploadId: 's3-upload', totalParts: 3, partSizeBytes: 8_388_608n },
    });

    expect(session.mode).toBe('por_partes');
    expect(session.multipart).toEqual({
      uploadId: 's3-upload',
      totalParts: 3,
      partSizeBytes: 8_388_608n,
    });
  });

  it('CA-7: el tamaño declarado debe ser mayor que 0', () => {
    expect(() => start({ declaredBytes: 0n })).toThrow(TypeError);
  });

  it('CA-2: una carga por partes exige partes y tamaño de parte positivos', () => {
    expect(() => start({ multipart: { uploadId: 'x', totalParts: 0, partSizeBytes: 1n } })).toThrow(
      TypeError,
    );
  });

  describe('vencimiento (CA-9)', () => {
    it('CA-9: vence a las 24 h de su creación (constante de dominio)', () => {
      const session = start();

      expect(UPLOAD_TTL_HOURS).toBe(24);
      expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBe(24 * HOUR_MS);
    });

    it('CA-9: `isExpired` es falso un instante antes de las 24 h y verdadero a las 24 h', () => {
      const session = start();
      const created = session.createdAt.getTime();

      expect(session.isExpired(new Date(created + 24 * HOUR_MS - 1))).toBe(false);
      expect(session.isExpired(new Date(created + 24 * HOUR_MS))).toBe(true);
    });
  });

  describe('transiciones', () => {
    const later = new Date(clock.now().getTime() + HOUR_MS);

    it('CA-1: `activa → completada` marca la fecha de fin y devuelve una copia', () => {
      const session = start();

      const completed = session.complete(later);

      expect(completed).not.toBe(session);
      expect(session.state).toBe('activa');
      expect(completed.state).toBe('completada');
      expect(completed.finishedAt).toEqual(later);
      expect(completed.updatedAt).toEqual(later);
    });

    it.each(['tamano', 'tipo_invalido'] as const)(
      'CA-5, CA-11: `activa → rechazada` con motivo `%s`',
      (reason) => {
        const rejected = start().reject(reason, later);

        expect(rejected.state).toBe('rechazada');
        expect(rejected.rejectionReason).toBe(reason);
      },
    );

    it('CA-11: `rechazada` exige un motivo conocido', () => {
      expect(() => start().reject('otro' as never, later)).toThrow(TypeError);
    });

    it('CA-22: `activa → cancelada`', () => {
      expect(start().cancel(later).state).toBe('cancelada');
    });

    it('CA-9: `activa → expirada`', () => {
      expect(start().expire(later).state).toBe('expirada');
    });

    it('CA-9: una carga vencida no se puede completar', () => {
      const session = start();
      const expiredAt = new Date(session.expiresAt.getTime());

      expect(() => session.complete(expiredAt)).toThrow(InvalidUploadTransitionError);
    });

    it.each([
      ['completada', (s: UploadSession) => s.complete(later)],
      ['rechazada', (s: UploadSession) => s.reject('tamano', later)],
      ['cancelada', (s: UploadSession) => s.cancel(later)],
      ['expirada', (s: UploadSession) => s.expire(later)],
    ])('CA-22: desde `%s` no hay ninguna otra transición', (_state, finish) => {
      const finished = finish(start());

      expect(() => finished.complete(later)).toThrow(InvalidUploadTransitionError);
      expect(() => finished.reject('tamano', later)).toThrow(InvalidUploadTransitionError);
      expect(() => finished.cancel(later)).toThrow(InvalidUploadTransitionError);
      expect(() => finished.expire(later)).toThrow(InvalidUploadTransitionError);
    });
  });

  it('`rehydrate` reconstruye el mismo estado que `snapshot`', () => {
    const session = start().reject('tipo_invalido', clock.now());

    const copy = UploadSession.rehydrate(session.snapshot());

    expect(copy.snapshot()).toEqual(session.snapshot());
  });

  it('`rehydrate` rechaza un `rechazada` sin motivo (ck_carga_rechazo)', () => {
    const snapshot = { ...start().snapshot(), state: 'rechazada' as const };

    expect(() => UploadSession.rehydrate(snapshot)).toThrow(TypeError);
  });

  it('es inmutable y no comparte fechas', () => {
    const session = start();
    session.createdAt.setTime(0);

    expect(Object.isFrozen(session)).toBe(true);
    expect(session.createdAt.getTime()).not.toBe(0);
  });
});
