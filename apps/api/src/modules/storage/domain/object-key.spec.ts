import { ObjectKey } from './object-key';

const OWNER = '11111111-1111-4111-8111-111111111111';
const FILE = '22222222-2222-4222-8222-222222222222';
const VERSION = '33333333-3333-4333-8333-333333333333';

describe('ObjectKey', () => {
  it('CA-6: es `u/{propietario}/{archivo}/{version}` y nunca lleva el nombre', () => {
    expect(ObjectKey.of(OWNER, FILE, VERSION).value).toBe(`u/${OWNER}/${FILE}/${VERSION}`);
  });

  it('CA-7: normaliza los UUID a minúsculas', () => {
    expect(ObjectKey.of(OWNER.toUpperCase(), FILE, VERSION).value).toBe(
      `u/${OWNER}/${FILE}/${VERSION}`,
    );
  });

  it.each([
    ['propietario', ['informe.docx', FILE, VERSION]],
    ['archivo', [OWNER, '../x', VERSION]],
    ['versión', [OWNER, FILE, '']],
    ['archivo con barra', [OWNER, `${FILE}/x`, VERSION]],
  ] as const)(
    'CA-7: rechaza un segmento de %s que no es UUID',
    (_label, [owner, file, version]) => {
      expect(() => ObjectKey.of(owner, file, version)).toThrow();
    },
  );

  it('`equals` compara por valor', () => {
    expect(ObjectKey.of(OWNER, FILE, VERSION).equals(ObjectKey.of(OWNER, FILE, VERSION))).toBe(
      true,
    );
  });

  it('014: `parse` reconstruye la clave guardada en `version_archivo.clave_objeto`', () => {
    const key = ObjectKey.of(OWNER, FILE, VERSION);

    expect(ObjectKey.parse(key.value).equals(key)).toBe(true);
  });

  it.each([
    'u/informe.docx',
    `x/${OWNER}/${FILE}/${VERSION}`,
    `u/${OWNER}/${FILE}`,
    `u/${OWNER}/${FILE}/${VERSION}/extra`,
  ])('014: `parse` rechaza una clave con otra forma (%s)', (value) => {
    expect(() => ObjectKey.parse(value)).toThrow();
  });

  it('es inmutable', () => {
    expect(Object.isFrozen(ObjectKey.of(OWNER, FILE, VERSION))).toBe(true);
  });
});
