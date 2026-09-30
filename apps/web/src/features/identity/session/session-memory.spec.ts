import { forgetSession, recallSession, rememberSession } from './session-memory';
import { sessionFixture } from './test-session';

describe('session-memory', () => {
  beforeEach(() => {
    forgetSession();
  });

  it('devuelve la sesión recordada mientras el token no vence', () => {
    const now = Date.now();
    const session = sessionFixture({ now, ttlMs: 60_000 });
    rememberSession(session);

    expect(recallSession(now)).toBe(session);
  });

  it('olvida una sesión cuyo token ya venció', () => {
    const now = Date.now();
    rememberSession(sessionFixture({ now, ttlMs: 60_000 }));

    expect(recallSession(now + 60_000)).toBeNull();
    expect(recallSession(now)).toBeNull();
  });

  it('forgetSession la borra', () => {
    rememberSession(sessionFixture());
    forgetSession();

    expect(recallSession(Date.now())).toBeNull();
  });
});
