import * as notifications from './index';

describe('API pública de `notifications`', () => {
  it('CA-21, 009: exporta solo los puertos `IMailer` (token y validación de la clave) e `INotifier`, la cola `mail` y los módulos de `api` y `worker`', () => {
    expect(Object.keys(notifications).sort()).toEqual(
      [
        'I_MAILER',
        'I_NOTIFIER',
        'MAIL_QUEUE',
        'NotificationsModule',
        'NotificationsWorkerModule',
        'assertIdempotencyKey',
      ].sort(),
    );
  });
});
