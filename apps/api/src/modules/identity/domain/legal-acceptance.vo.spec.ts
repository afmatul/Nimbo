import { LegalAcceptance } from './legal-acceptance.vo';

describe('LegalAcceptance', () => {
  it('CA-1: guarda las versiones aceptadas y la fecha', () => {
    const acceptance = LegalAcceptance.of({
      termsVersion: '2026-09-01',
      privacyVersion: '2026-09-02',
      acceptedAt: new Date('2026-09-27T12:00:00.000Z'),
    });

    expect(acceptance.termsVersion).toBe('2026-09-01');
    expect(acceptance.privacyVersion).toBe('2026-09-02');
    expect(acceptance.acceptedAt.toISOString()).toBe('2026-09-27T12:00:00.000Z');
  });

  it('copia la fecha: mutar la de entrada o la leída no la altera', () => {
    const input = new Date('2026-09-27T12:00:00.000Z');
    const acceptance = LegalAcceptance.of({
      termsVersion: 't',
      privacyVersion: 'p',
      acceptedAt: input,
    });

    input.setUTCFullYear(1999);
    acceptance.acceptedAt.setUTCFullYear(1999);

    expect(acceptance.acceptedAt.toISOString()).toBe('2026-09-27T12:00:00.000Z');
  });
});
