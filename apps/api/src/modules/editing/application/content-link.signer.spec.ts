import { JwtService } from '@nestjs/jwt';

import { FixedClock } from '../../../shared';

import { ContentLinkSigner } from './content-link.signer';

const SECRET = 'secreto-de-prueba-de-onlyoffice-con-32-caracteres';
const NOW = new Date('2026-10-16T12:00:00.000Z');
const SESSION = '0b6f1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const OWNER = '2d8b3f40-5c6d-4e7f-a081-9b0c1d2e3f40';
const FILE = '1c7a2e3f-4b5c-4d6e-9f70-8a9b0c1d2e3f';
const VERSION = '4fad5162-7e8f-4091-82a3-1d2e3f405162';

const jwt = new JwtService({});
const signerAt = (now: Date, secret = SECRET) =>
  new ContentLinkSigner(jwt, new FixedClock(now), secret);

describe('ContentLinkSigner (plan 016 §4: enlace de contenido de minutos)', () => {
  it('CA-1: el enlace de una sesión lleva sesión y propietaria y se verifica tal cual', () => {
    const signer = signerAt(NOW);

    const token = signer.forSession({ sessionId: SESSION, ownerId: OWNER });

    expect(signer.verify(token)).toEqual({ kind: 'session', sessionId: SESSION, ownerId: OWNER });
  });

  it('CA-3: el enlace de solo lectura lleva archivo, versión y propietaria, sin sesión', () => {
    const signer = signerAt(NOW);

    const token = signer.forVersion({ fileId: FILE, versionId: VERSION, ownerId: OWNER });

    expect(signer.verify(token)).toEqual({
      kind: 'version',
      fileId: FILE,
      versionId: VERSION,
      ownerId: OWNER,
    });
  });

  it('CA-16: un enlace vencido no vale', () => {
    const token = signerAt(NOW).forSession({ sessionId: SESSION, ownerId: OWNER });
    const later = new Date(NOW.getTime() + 301_000);

    expect(signerAt(later).verify(token)).toBeNull();
  });

  it.each([
    [
      'otra clave',
      () =>
        signerAt(NOW, 'otra-clave-de-prueba-de-32-caracteres!!').forSession({
          sessionId: SESSION,
          ownerId: OWNER,
        }),
    ],
    [
      'un JWT de otro tipo (p. ej. la configuración de ONLYOFFICE)',
      () => jwt.sign({ sid: SESSION, oid: OWNER }, { secret: SECRET }),
    ],
    [
      'otro algoritmo',
      () =>
        jwt.sign(
          { typ: 'nimbo.edit-content', sid: SESSION, oid: OWNER },
          { secret: SECRET, algorithm: 'HS512' },
        ),
    ],
    ['basura', () => 'no-es-un-jwt'],
  ])('CA-16, CA-19: no vale un enlace con %s', (_case, tokenOf) => {
    expect(signerAt(NOW).verify(tokenOf())).toBeNull();
  });
});
