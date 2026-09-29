import * as notifications from './index';

describe('API pública de `notifications`', () => {
  it('CA-21: exporta solo el puerto `IMailer` (token y validación de la clave), la cola `mail` y los módulos de `api` y `worker` (plan §6.6)', () => {
    expect(Object.keys(notifications).sort()).toEqual(
      [
        'I_MAILER',
        'MAIL_QUEUE',
        'NotificationsModule',
        'NotificationsWorkerModule',
        'assertIdempotencyKey',
      ].sort(),
    );
  });
});
