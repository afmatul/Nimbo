import * as notifications from './index';

describe('API pública de `notifications`', () => {
  it('CA-21: exporta solo el puerto `IMailer` (token y validación de la clave) y los módulos (plan §6.6)', () => {
    expect(Object.keys(notifications).sort()).toEqual(
      ['I_MAILER', 'NotificationsModule', 'assertIdempotencyKey'].sort(),
    );
  });
});
