import { MAIL_JOB_NAME, MAIL_JOB_OPTIONS, MAIL_QUEUE } from './mail-queue';

describe('cola `mail`', () => {
  it('CA-21: la cola se llama `mail` y el trabajo `send`', () => {
    expect(MAIL_QUEUE).toBe('mail');
    expect(MAIL_JOB_NAME).toBe('send');
  });

  it('CA-21: el envío y 5 reintentos con retroceso exponencial desde 5 s (R-9)', () => {
    expect(MAIL_JOB_OPTIONS.attempts).toBe(6);
    expect(MAIL_JOB_OPTIONS.backoff).toEqual({ type: 'exponential', delay: 5000 });
  });

  it('CA-21: borra los completados y conserva los fallidos 24 h (lo que dura el enlace)', () => {
    expect(MAIL_JOB_OPTIONS.removeOnComplete).toBe(true);
    expect(MAIL_JOB_OPTIONS.removeOnFail).toEqual({ age: 86400 });
  });

  it('CA-21: las opciones son inmutables', () => {
    expect(Object.isFrozen(MAIL_JOB_OPTIONS)).toBe(true);
  });
});
