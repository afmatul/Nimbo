import { AUDIT_NOTE_MAX_LENGTH, sanitizeAttributes } from './attribute-sanitizer';
import type { AttributeRules } from './attribute-sanitizer';

const RULES: AttributeRules = {
  itemCount: 'number',
  mode: 'text',
  nodeType: ['file', 'folder'],
  replaced: 'boolean',
  versionId: 'uuid',
};
const VERSION_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('sanitizeAttributes', () => {
  it('CA-4: conserva los atributos permitidos y planos, sin rechazos', () => {
    const raw = { itemCount: 3, mode: 'multipart', nodeType: 'folder' };

    expect(sanitizeAttributes(RULES, raw)).toEqual({ attributes: raw, rejections: [] });
  });

  it('014 CA-19: conserva un booleano y un UUID donde el catálogo los declara', () => {
    const raw = { replaced: true, versionId: VERSION_ID };

    expect(sanitizeAttributes(RULES, raw)).toEqual({ attributes: raw, rejections: [] });
  });

  it('CA-4: sin atributos devuelve un objeto vacío', () => {
    expect(sanitizeAttributes(RULES, undefined)).toEqual({ attributes: {}, rejections: [] });
  });

  it.each([
    ['nombre de archivo', 'fileName', 'informe-secreto.docx'],
    ['URL', 'url', 'https://minio.local/objeto?firma=abc'],
    ['token', 'token', 'eyJhbGciOi.secreto'],
    ['contraseña', 'password', 'Contraseña-Secreta-1'],
    ['clave de enlace', 'linkKey', 'clave-de-enlace-secreta'],
    ['propiedad del prototipo', 'constructor', 'valor-secreto'],
  ])('CA-4: descarta una clave fuera del catálogo (%s) sin repetir el valor', (_, key, value) => {
    const result = sanitizeAttributes(RULES, { itemCount: 1, [key]: value });

    expect(result.attributes).toEqual({ itemCount: 1 });
    expect(result.rejections).toEqual([{ code: 'attribute_not_allowed', key }]);
    expect(JSON.stringify(result.rejections)).not.toContain(value);
  });

  it.each([
    ['objeto', { fileName: 'secreto.docx' }],
    ['arreglo', ['secreto.docx']],
    ['null', null],
  ])('CA-4: descarta un valor no plano (%s) sin repetirlo', (_, value) => {
    const result = sanitizeAttributes(RULES, { mode: value });

    expect(result.attributes).toEqual({});
    expect(result.rejections).toEqual([{ code: 'attribute_not_flat', key: 'mode' }]);
    expect(JSON.stringify(result.rejections)).not.toContain('secreto');
  });

  it('CA-4: descarta un texto de más de 500 caracteres y conserva uno de 500', () => {
    const long = sanitizeAttributes(RULES, { mode: 'x'.repeat(AUDIT_NOTE_MAX_LENGTH + 1) });
    const exact = sanitizeAttributes(RULES, { mode: 'x'.repeat(AUDIT_NOTE_MAX_LENGTH) });

    expect(long).toEqual({
      attributes: {},
      rejections: [{ code: 'attribute_too_long', key: 'mode' }],
    });
    expect(exact.rejections).toEqual([]);
  });

  it.each([
    ['texto donde va un número', { itemCount: '3' }, 'itemCount'],
    ['número no finito', { itemCount: Number.NaN }, 'itemCount'],
    ['número donde va texto', { mode: 1 }, 'mode'],
    ['valor fuera de la lista', { nodeType: 'usuario' }, 'nodeType'],
    ['texto donde va un booleano', { replaced: 'true' }, 'replaced'],
    ['booleano donde va un número', { itemCount: true }, 'itemCount'],
    ['texto que no es UUID donde va un UUID', { versionId: 'informe-secreto.docx' }, 'versionId'],
  ])('CA-4: descarta un valor de otro tipo (%s)', (_, raw, key) => {
    const result = sanitizeAttributes(RULES, raw);

    expect(result.attributes).toEqual({});
    expect(result.rejections).toEqual([{ code: 'attribute_not_allowed', key }]);
  });

  it('CA-4: el resultado es inmutable', () => {
    const result = sanitizeAttributes(RULES, { itemCount: 1 });

    expect(Object.isFrozen(result.attributes)).toBe(true);
    expect(Object.isFrozen(result.rejections)).toBe(true);
  });
});
