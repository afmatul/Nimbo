import { EditSession } from './edit-session';
import type { EditSessionFailure } from './edit-session';

const STARTED = new Date('2026-10-16T10:00:00.000Z');
const ENDED = new Date('2026-10-16T10:30:00.000Z');

const opened = (): EditSession =>
  EditSession.open({
    id: '0b6f1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
    fileId: '1c7a2e3f-4b5c-4d6e-9f70-8a9b0c1d2e3f',
    ownerId: '2d8b3f40-5c6d-4e7f-a081-9b0c1d2e3f40',
    openedBy: '3e9c4051-6d7e-4f80-b192-0c1d2e3f4051',
    baseVersionId: '4fad5162-7e8f-4091-82a3-1d2e3f405162',
    now: STARTED,
  });

const finishers: readonly [string, (session: EditSession) => EditSession][] = [
  ['cerrada', (session) => session.startSaving().close(ENDED)],
  ['sin_cambios', (session) => session.closeWithoutChanges(ENDED)],
  ['fallida', (session) => session.fail('editor', ENDED)],
];

describe('EditSession (plan 016 §2)', () => {
  it('CA-9: nace `activa`, abierta, sin fin ni motivo de fallo', () => {
    const session = opened();

    expect(session.state).toBe('activa');
    expect(session.failureReason).toBeNull();
    expect(session.endedAt).toBeNull();
    expect(session.startedAt).toEqual(STARTED);
  });

  it('CA-9: `activa → guardando → cerrada` cuando el editor entrega el documento (estado 2)', () => {
    const saving = opened().startSaving();
    const closed = saving.close(ENDED);

    expect(saving.state).toBe('guardando');
    expect(saving.endedAt).toBeNull();
    expect(closed.state).toBe('cerrada');
    expect(closed.endedAt).toEqual(ENDED);
  });

  it('CA-11: `activa → sin_cambios` al cerrarse sin cambios (estado 4)', () => {
    const unchanged = opened().closeWithoutChanges(ENDED);

    expect(unchanged.state).toBe('sin_cambios');
    expect(unchanged.endedAt).toEqual(ENDED);
  });

  it.each<EditSessionFailure>(['integridad', 'archivo_purgado', 'almacenamiento'])(
    'CA-14: `guardando → fallida` con motivo `%s`',
    (reason) => {
      const failed = opened().startSaving().fail(reason, ENDED);

      expect(failed.state).toBe('fallida');
      expect(failed.failureReason).toBe(reason);
      expect(failed.endedAt).toEqual(ENDED);
    },
  );

  it('CA-14: `activa → fallida` cuando el editor informa un error (estado 3)', () => {
    const failed = opened().fail('editor', ENDED);

    expect(failed.state).toBe('fallida');
    expect(failed.failureReason).toBe('editor');
  });

  it('CA-9: una transición devuelve otra sesión y no cambia la original', () => {
    const session = opened();
    session.startSaving();

    expect(session.state).toBe('activa');
  });

  it('CA-11: solo se llega a `guardando` desde `activa`: una sesión sin cambios no guarda', () => {
    expect(() => opened().closeWithoutChanges(ENDED).startSaving()).toThrow(TypeError);
  });

  it('CA-10: una sesión que ya guarda no vuelve a guardar ni se cierra sin cambios', () => {
    const saving = opened().startSaving();

    expect(() => saving.startSaving()).toThrow(TypeError);
    expect(() => saving.closeWithoutChanges(ENDED)).toThrow(TypeError);
  });

  it('CA-9: solo se cierra con versión una sesión que está guardando', () => {
    expect(() => opened().close(ENDED)).toThrow(TypeError);
  });

  it.each(finishers)('CA-14: `%s` es final: no admite otra transición', (_state, finish) => {
    const finished = finish(opened());

    expect(() => finished.startSaving()).toThrow(TypeError);
    expect(() => finished.close(ENDED)).toThrow(TypeError);
    expect(() => finished.closeWithoutChanges(ENDED)).toThrow(TypeError);
    expect(() => finished.fail('integridad', ENDED)).toThrow(TypeError);
  });

  it('CA-14: rehidrata una sesión `fallida` con su motivo; el motivo existe solo en `fallida`', () => {
    const failed = opened().startSaving().fail('integridad', ENDED);

    expect(EditSession.rehydrate(failed.snapshot()).failureReason).toBe('integridad');
    expect(() => EditSession.rehydrate({ ...failed.snapshot(), failureReason: null })).toThrow(
      TypeError,
    );
    expect(() =>
      EditSession.rehydrate({ ...opened().snapshot(), failureReason: 'editor' }),
    ).toThrow(TypeError);
  });
});
