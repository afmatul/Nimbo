import * as crypto from 'node:crypto';

import { Session } from './session.entity';

jest.mock('node:crypto', () => {
  const actual = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...actual,
    timingSafeEqual: jest.fn((left: NodeJS.ArrayBufferView, right: NodeJS.ArrayBufferView) =>
      actual.timingSafeEqual(left, right),
    ),
  };
});

const DAY_MS = 24 * 60 * 60 * 1000;
const HASH = 'a'.repeat(64);
const PREVIOUS = 'b'.repeat(64);
const FORGED = 'c'.repeat(64);

const open = (now = new Date('2026-09-01T00:00:00.000Z')): Session =>
  Session.open({
    id: '11111111-2222-4333-8444-555555555555',
    userId: '66666666-7777-4888-8999-aaaaaaaaaaaa',
    deviceId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    secretHash: HASH,
    now,
    maxLifetime: 30 * DAY_MS,
  });

describe('Session.open y stateAt', () => {
  it('abre con creación y último uso en now, sin secreto anterior ni rotación', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const session = open(now);

    expect(session.creadaEn).toEqual(now);
    expect(session.ultimoUso).toEqual(now);
    expect(session.expiraEn).toEqual(new Date(now.getTime() + 30 * DAY_MS));
    expect(session.refreshAnteriorHash).toBeNull();
    expect(session.rotadoEn).toBeNull();
    expect(session.refreshHash).toBe(HASH);
  });

  it('está revocada si hay fecha de revocación, aunque también esté vencida', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const revoked = open(now).revoke(now);
    const later = new Date(now.getTime() + 40 * DAY_MS);

    expect(revoked.stateAt(later, 7 * DAY_MS)).toBe('revoked');
  });

  it('vence en el límite de inactividad y sigue activa un segundo antes', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const session = open(now);
    const idle = 7 * DAY_MS;

    expect(session.stateAt(new Date(now.getTime() + idle), idle)).toBe('expired');
    expect(session.stateAt(new Date(now.getTime() + idle + 1000), idle)).toBe('expired');
    expect(session.stateAt(new Date(now.getTime() + idle - 1000), idle)).toBe('active');
  });

  it('vence en el límite de vida cuando el último uso todavía está dentro de la inactividad', () => {
    const now = new Date('2026-09-01T00:00:00.000Z');
    const expiraEn = new Date(now.getTime() + 30 * DAY_MS);
    const session = Session.rehydrate({
      id: '11111111-2222-4333-8444-555555555555',
      userId: '66666666-7777-4888-8999-aaaaaaaaaaaa',
      deviceId: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
      refreshHash: HASH,
      refreshAnteriorHash: null,
      rotadoEn: null,
      creadaEn: now,
      ultimoUso: new Date(expiraEn.getTime() - 60 * 60 * 1000),
      expiraEn,
      revocadaEn: null,
    });
    const idle = 7 * DAY_MS;

    expect(session.stateAt(expiraEn, idle)).toBe('expired');
    expect(session.stateAt(new Date(expiraEn.getTime() + 1000), idle)).toBe('expired');
    expect(session.stateAt(new Date(expiraEn.getTime() - 1000), idle)).toBe('active');
  });
});

describe('Session.matchSecret, rotate, revoke y refreshCookieMaxAge', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const grace = 10_000;

  it('reconoce el secreto vigente, el anterior dentro de la gracia y el reúso fuera de ella', () => {
    const spy = crypto.timingSafeEqual as jest.MockedFunction<typeof crypto.timingSafeEqual>;
    const session = open(now).rotate('d'.repeat(64), now);
    const older = session.rotate('d'.repeat(64), now);

    expect(session.matchSecret('d'.repeat(64), now, grace)).toBe('current');
    expect(session.matchSecret(HASH, now, grace)).toBe('previousWithinGrace');
    expect(session.matchSecret(HASH, new Date(now.getTime() + grace), grace)).toBe('previousWithinGrace');
    expect(session.matchSecret(HASH, new Date(now.getTime() + grace + 1), grace)).toBe('reuse');
    expect(older.matchSecret(HASH, now, grace)).toBe('reuse');
    expect(session.matchSecret(FORGED, now, grace)).toBe('reuse');
    expect(spy).toHaveBeenCalled();
  });

  it('rota en una instancia nueva y deja la original intacta', () => {
    const original = open(now);
    const at = new Date(now.getTime() + 5000);
    const next = original.rotate(PREVIOUS, at);

    expect(next).not.toBe(original);
    expect(next.refreshAnteriorHash).toBe(HASH);
    expect(next.refreshHash).toBe(PREVIOUS);
    expect(next.rotadoEn).toEqual(at);
    expect(next.ultimoUso).toEqual(at);
    expect(original.refreshAnteriorHash).toBeNull();
    expect(original.rotadoEn).toBeNull();
    expect(original.ultimoUso).toEqual(now);
  });

  it('revoca una sola vez y conserva la primera fecha', () => {
    const first = new Date(now.getTime() + 1000);
    const second = new Date(now.getTime() + 9000);
    const revoked = open(now).revoke(first).revoke(second);

    expect(revoked.revocadaEn).toEqual(first);
  });

  it('acota la cookie al mínimo entre la inactividad y lo que falta para vencer', () => {
    const session = open(now);
    const idle = 7 * DAY_MS;

    expect(session.refreshCookieMaxAge(new Date(now.getTime() + DAY_MS), idle)).toBe(idle);
    expect(session.refreshCookieMaxAge(new Date(now.getTime() + 29.5 * DAY_MS), idle)).toBe(0.5 * DAY_MS);
  });
});
