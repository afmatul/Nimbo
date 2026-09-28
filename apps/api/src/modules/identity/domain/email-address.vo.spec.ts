import { EmailAddress } from './email-address.vo';

describe('EmailAddress', () => {
  it('CA-3: recorta espacios y pasa el correo a minúsculas', () => {
    expect(EmailAddress.of('  Ana@Ejemplo.COM ').toString()).toBe('ana@ejemplo.com');
  });

  it('CA-3: trata como distintos un punto y un signo más en la parte local', () => {
    const dotted = EmailAddress.of('ana.b@ejemplo.com');
    const plus = EmailAddress.of('ana+nimbo@ejemplo.com');

    expect(dotted.toString()).not.toBe(plus.toString());
    expect(dotted.localPart()).toBe('ana.b');
    expect(plus.localPart()).toBe('ana+nimbo');
  });
});
