/**
 * @jest-environment jsdom
 */
import {
  REQUEST_LINK_EMAIL_KEY,
  saveRequestLinkEmail,
  takeRequestLinkEmail,
} from './request-link-email-storage';

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL = 'ana@ejemplo.com';

describe('request-link-email-storage (SEC-2)', () => {
  const now = new Date('2026-09-28T12:00:00.000Z');
  const storage = (): Storage => window.sessionStorage;

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('guarda solo el correo y savedAt', () => {
    saveRequestLinkEmail(storage(), EMAIL, now);

    const stored = JSON.parse(storage().getItem(REQUEST_LINK_EMAIL_KEY) ?? '') as Record<
      string,
      unknown
    >;
    expect(stored).toEqual({ email: EMAIL, savedAt: now.toISOString() });
  });

  it('se lee solo si tiene menos de 24 h y se borra al leer', () => {
    saveRequestLinkEmail(storage(), EMAIL, now);

    expect(takeRequestLinkEmail(storage(), new Date(now.getTime() + DAY_MS - 1))).toBe(EMAIL);
    expect(storage().getItem(REQUEST_LINK_EMAIL_KEY)).toBeNull();
    expect(takeRequestLinkEmail(storage(), now)).toBe('');
  });

  it('descarta y borra un correo guardado hace 24 h o más', () => {
    saveRequestLinkEmail(storage(), EMAIL, now);

    expect(takeRequestLinkEmail(storage(), new Date(now.getTime() + DAY_MS))).toBe('');
    expect(storage().getItem(REQUEST_LINK_EMAIL_KEY)).toBeNull();
  });

  it.each([EMAIL, '{"email":"ana@ejemplo.com"}', '{"email":1,"savedAt":"2026-09-28"}', '{'])(
    'descarta un valor sin el formato esperado: %s',
    (raw) => {
      storage().setItem(REQUEST_LINK_EMAIL_KEY, raw);

      expect(takeRequestLinkEmail(storage(), now)).toBe('');
      expect(storage().getItem(REQUEST_LINK_EMAIL_KEY)).toBeNull();
    },
  );

  it('sin almacenamiento devuelve cadena vacía y no falla al guardar', () => {
    expect(takeRequestLinkEmail(undefined, now)).toBe('');
    expect(() => saveRequestLinkEmail(undefined, EMAIL, now)).not.toThrow();
  });
});
