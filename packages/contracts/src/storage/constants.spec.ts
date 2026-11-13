import * as contracts from '../index';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  FILE_NAME_MAX_LENGTH,
  FILE_TYPE_REASONS,
  FILES_PAGE_DEFAULT,
  FILES_PAGE_MAX,
  REJECTION_REASONS,
  STORAGE_ERROR_CODES,
  STORAGE_FIELD_ISSUE_REASONS,
  STORAGE_FIELD_MESSAGES,
  STORAGE_NODE_FIELD_MESSAGES,
  UPLOAD_TTL_HOURS,
  formatBytes,
} from '../index';

describe('STORAGE_ERROR_CODES', () => {
  it('CA-3, CA-4, CA-7, CA-19, CA-28: es exactamente el catálogo de 005 (plan §5), 006 (plan §4 y §9.2), 014 (plan §4), 010 (plan §2) y 017 (plan §4)', () => {
    expect(Object.values(STORAGE_ERROR_CODES).sort()).toEqual(
      [
        'STORAGE_INVALID_UPLOAD_REQUEST',
        'STORAGE_INVALID_QUERY',
        'STORAGE_EMPTY_FILE',
        'STORAGE_FILE_TOO_LARGE',
        'STORAGE_QUOTA_EXCEEDED',
        'STORAGE_NAME_CONFLICT',
        'STORAGE_UPLOAD_NOT_FOUND',
        'STORAGE_UPLOAD_EXPIRED',
        'STORAGE_UPLOAD_INCOMPLETE',
        'STORAGE_UPLOAD_SIZE_MISMATCH',
        'STORAGE_INVALID_FILE_TYPE',
        'STORAGE_NODE_NOT_FOUND',
        'STORAGE_TOO_MANY_REQUESTS',
        'STORAGE_INVALID_MOVE',
        'STORAGE_FOLDER_DEPTH_EXCEEDED',
        'STORAGE_INVALID_NODE_REQUEST',
        'STORAGE_QUICK_ACCESS_LIMIT',
        'STORAGE_PREVIEW_UNSUPPORTED',
        'STORAGE_VERSION_NOT_FOUND',
        'STORAGE_VERSION_ALREADY_CURRENT',
        'STORAGE_ACCOUNT_READ_ONLY',
        'STORAGE_BATCH_TOO_LARGE',
      ].sort(),
    );
  });

  it('CA-7: cada clave coincide con su código', () => {
    for (const [key, code] of Object.entries(STORAGE_ERROR_CODES)) {
      expect(code).toBe(key);
    }
  });
});

describe('motivos', () => {
  it('CA-7, 018 CA-9: STORAGE_FIELD_ISSUE_REASONS es el conjunto cerrado de motivos de campo', () => {
    expect([...STORAGE_FIELD_ISSUE_REASONS].sort()).toEqual(
      [
        'REQUIRED',
        'INVALID_NAME',
        'NAME_TOO_LONG',
        'INVALID_SIZE',
        'UNKNOWN_FIELD',
        'INVALID_CURSOR',
        'INVALID_FOLDER',
        'INVALID_SORT',
        'INVALID_DIRECTION',
        'INVALID_TYPE',
        'INVALID_DATE',
        'INVALID_RANGE',
      ].sort(),
    );
  });

  it('CA-7: cada motivo de campo tiene un mensaje en español', () => {
    expect(Object.keys(STORAGE_FIELD_MESSAGES).sort()).toEqual(
      [...STORAGE_FIELD_ISSUE_REASONS].sort(),
    );
    for (const message of Object.values(STORAGE_FIELD_MESSAGES)) {
      expect(message).toMatch(/\.$/);
    }
    expect(STORAGE_FIELD_MESSAGES.NAME_TOO_LONG).toContain(String(FILE_NAME_MAX_LENGTH));
  });

  it('CA-2 (006): carpetas y renombrar usan los mismos motivos, con mensajes de nombre sin «subir»', () => {
    expect(Object.keys(STORAGE_NODE_FIELD_MESSAGES).sort()).toEqual(
      [...STORAGE_FIELD_ISSUE_REASONS].sort(),
    );
    expect(STORAGE_NODE_FIELD_MESSAGES.INVALID_NAME).not.toMatch(/subir/i);
    expect(STORAGE_NODE_FIELD_MESSAGES.NAME_TOO_LONG).toContain(String(FILE_NAME_MAX_LENGTH));
    expect(STORAGE_NODE_FIELD_MESSAGES.NAME_TOO_LONG).not.toMatch(/subir/i);
  });

  it('CA-7: no pisa el FIELD_ISSUE_REASONS de identity en la raíz del paquete', () => {
    expect(contracts.FIELD_ISSUE_REASONS).toContain('INVALID_EMAIL');
  });

  it('CA-3: REJECTION_REASONS es `tamano` y `tipo_invalido`', () => {
    expect([...REJECTION_REASONS].sort()).toEqual(['tamano', 'tipo_invalido']);
  });

  it('CA-3: FILE_TYPE_REASONS es `signature`, `executable` y `text`', () => {
    expect([...FILE_TYPE_REASONS].sort()).toEqual(['executable', 'signature', 'text']);
  });
});

describe('parámetros de dominio', () => {
  it('CA-19: vigencias, largo de nombre y página de listado son constantes, no configuración', () => {
    expect(UPLOAD_TTL_HOURS).toBe(24);
    expect(DOWNLOAD_URL_TTL_SECONDS).toBe(300);
    expect(FILE_NAME_MAX_LENGTH).toBe(255);
    expect(FILES_PAGE_DEFAULT).toBe(50);
    expect(FILES_PAGE_MAX).toBe(100);
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [1_500, '1,5 KB'],
    [50_000_000, '50 MB'],
    [300_000_000, '300 MB'],
    [1_000_000_000, '1 GB'],
    [1_500_000_000, '1,5 GB'],
    [2_000_000_000_000, '2 TB'],
  ])('CA-3, CA-4: %d bytes se muestra como «%s»', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it('CA-3, CA-4: usa unidades decimales, como el catálogo de planes (50 MB, 1 GB)', () => {
    expect(formatBytes(1_048_576)).toBe('1 MB');
    expect(formatBytes(1_048_576)).not.toMatch(/iB/);
  });

  it('CA-3, CA-4: si el redondeo llega a 1000 sube de unidad', () => {
    expect(formatBytes(999_999)).toBe('1 MB');
  });

  it('CA-3: arma la frase de CA-3 con cifras en español', () => {
    const message = `Este archivo pesa ${formatBytes(52_400_000)} y tu plan permite hasta ${formatBytes(50_000_000)} por archivo.`;

    expect(message).toBe('Este archivo pesa 52,4 MB y tu plan permite hasta 50 MB por archivo.');
  });
});
