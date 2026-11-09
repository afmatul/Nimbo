import { SHARED_ERROR_CODES, SHARING_ERROR_CODES } from '@nimbo/contracts';

import {
  PUBLIC_LINK_DOWNLOAD_FAILED,
  PUBLIC_LINK_OPEN_FAILED,
  publicLinkMessage,
} from './public-link-messages';

describe('mensajes de la página del enlace público (013b §6, RN-1)', () => {
  it.each([
    [
      'CA-6',
      SHARING_ERROR_CODES.SHARING_LINK_UNAVAILABLE,
      'Este enlace ya no está disponible. Pide a quien te lo compartió uno nuevo.',
      'neutral',
    ],
    [
      'CA-4',
      SHARING_ERROR_CODES.SHARING_LINK_PASSWORD_INVALID,
      'La contraseña no es correcta. Revísala y vuelve a intentarlo.',
      'error',
    ],
    [
      'CA-7 (al abrir)',
      PUBLIC_LINK_OPEN_FAILED,
      'No pudimos cargar el archivo compartido. Revisa tu conexión e inténtalo de nuevo.',
      'error',
    ],
    [
      'CA-7 (al descargar)',
      PUBLIC_LINK_DOWNLOAD_FAILED,
      'No pudimos iniciar la descarga. Revisa tu conexión e inténtalo de nuevo.',
      'warning',
    ],
  ] as const)('%s: %s', (_ca, key, title, tone) => {
    expect(publicLinkMessage(key)).toEqual({ title, tone });
  });

  it('CA-7: la red al abrir y al descargar tienen textos distintos', () => {
    expect(publicLinkMessage(PUBLIC_LINK_OPEN_FAILED).title).not.toBe(
      publicLinkMessage(PUBLIC_LINK_DOWNLOAD_FAILED).title,
    );
  });

  it('CA-5: el `429` es neutro, en advertencia, con los minutos de `Retry-After` hacia arriba', () => {
    expect(publicLinkMessage(SHARED_ERROR_CODES.TOO_MANY_REQUESTS, 3_541)).toEqual({
      title: 'Hubo demasiados intentos con este enlace. Espera 60 minutos e inténtalo de nuevo.',
      tone: 'warning',
    });
  });

  it.each([
    ['con menos de un minuto de espera', 30],
    ['sin `Retry-After`', undefined],
  ])('CA-5: %s, dice «1 minuto» en singular', (_caso, seconds) => {
    expect(publicLinkMessage(SHARED_ERROR_CODES.TOO_MANY_REQUESTS, seconds).title).toBe(
      'Hubo demasiados intentos con este enlace. Espera 1 minuto e inténtalo de nuevo.',
    );
  });

  it('CA-5: con más de un minuto dice «minutos» en plural', () => {
    expect(publicLinkMessage(SHARED_ERROR_CODES.TOO_MANY_REQUESTS, 61).title).toBe(
      'Hubo demasiados intentos con este enlace. Espera 2 minutos e inténtalo de nuevo.',
    );
  });

  it('CA-5, RN-1: el `429` no usa el texto genérico ni dice el motivo', () => {
    const { title } = publicLinkMessage(SHARED_ERROR_CODES.TOO_MANY_REQUESTS, 900);

    expect(title).not.toMatch(/Hiciste|contraseña|red|techo/);
  });
});
