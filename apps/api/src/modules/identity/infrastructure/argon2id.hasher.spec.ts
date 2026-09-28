import type { IPasswordHasher } from '../application/ports/i-password-hasher.port';

import {
  ARGON2ID_MEMORY_COST_KIB,
  ARGON2ID_PARALLELISM,
  ARGON2ID_TIME_COST,
  Argon2idHasher,
} from './argon2id.hasher';

const PASSWORD = 'Nimbo-Seguro-2026';
/** `$argon2id$v=19$<parámetros>$<sal>$<hash>`, con sal y hash en base64 sin relleno. */
const PHC = /^\$argon2id\$v=19\$([a-z]=\d+(?:,[a-z]=\d+)*)\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;
/** Mínimo de OWASP que fija RN-3. */
const RN3_MINIMUM = { m: 19456, t: 2, p: 1 };

/** Parámetros del PHC como mapa: la librería los escribe en orden `m,p,t` y el orden no cambia su sentido. */
const phcParameters = (phc: string): Record<string, number> => {
  const list = PHC.exec(phc)?.[1] ?? '';
  return Object.fromEntries(
    list.split(',').map((pair) => {
      const [name = '', value = ''] = pair.split('=');
      return [name, Number(value)];
    }),
  );
};

/** Contrato de `IPasswordHasher` (plan §6.4, ADR-0017) contra la librería real. */
describe('Argon2idHasher (CA-19)', () => {
  const hasher: IPasswordHasher = new Argon2idHasher();

  it('CA-19: produce un PHC de Argon2id con los parámetros de RN-3', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(hash.reveal()).toMatch(PHC);
    expect(phcParameters(hash.reveal())).toEqual(RN3_MINIMUM);
  });

  it('CA-19: los parámetros son constantes con nombre iguales al mínimo de RN-3', () => {
    expect({
      m: ARGON2ID_MEMORY_COST_KIB,
      t: ARGON2ID_TIME_COST,
      p: ARGON2ID_PARALLELISM,
    }).toEqual(RN3_MINIMUM);
  });

  it('CA-19: la misma contraseña produce hashes distintos (sal aleatoria)', async () => {
    const [first, second] = await Promise.all([hasher.hash(PASSWORD), hasher.hash(PASSWORD)]);

    expect(first.reveal()).not.toBe(second.reveal());
  });

  it('CA-19: `verify` acepta la contraseña original contra cada hash y rechaza otra', async () => {
    const [first, second] = await Promise.all([hasher.hash(PASSWORD), hasher.hash(PASSWORD)]);

    await expect(hasher.verify(first, PASSWORD)).resolves.toBe(true);
    await expect(hasher.verify(second, PASSWORD)).resolves.toBe(true);
    await expect(hasher.verify(first, 'Nimbo-Seguro-2027')).resolves.toBe(false);
  });

  it('CA-19: el hash no aparece al serializar el resultado', async () => {
    const hash = await hasher.hash(PASSWORD);

    expect(JSON.stringify({ hash })).not.toContain(hash.reveal());
    expect(JSON.stringify({ hash })).not.toContain(PASSWORD);
  });
});
