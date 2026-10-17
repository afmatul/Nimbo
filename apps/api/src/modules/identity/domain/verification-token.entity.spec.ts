import { InvalidTokenTransitionError, VerificationToken } from './verification-token.entity';

const createdAt = new Date('2026-09-27T12:00:00.000Z');
const expiresAt = new Date('2026-09-28T12:00:00.000Z');

const issue = (): VerificationToken =>
  VerificationToken.issue({
    id: '11111111-2222-4333-8444-555555555555',
    userId: '66666666-7777-4888-8999-aaaaaaaaaaaa',
    type: 'verificacion',
    tokenHash: 'a'.repeat(64),
    createdAt,
    expiresAt,
  });

describe('VerificationToken', () => {
  it('exige que el vencimiento sea posterior a la creación', () => {
    expect(() =>
      VerificationToken.issue({
        id: '11111111-2222-4333-8444-555555555555',
        userId: '66666666-7777-4888-8999-aaaaaaaaaaaa',
        type: 'verificacion',
        tokenHash: 'a'.repeat(64),
        createdAt,
        expiresAt: createdAt,
      }),
    ).toThrow(TypeError);
  });

  it('CA-11: está invalidado si tiene fecha de invalidación, aunque también esté usado o vencido', () => {
    const token = issue().invalidate(createdAt);
    const afterExpiry = new Date(expiresAt.getTime() + 1000);
    expect(token.stateAt(afterExpiry)).toBe('invalidated');
  });

  it('CA-11: está usado si tiene fecha de uso y no fue invalidado', () => {
    const token = issue().consume(createdAt);
    expect(token.stateAt(createdAt)).toBe('used');
  });

  it('CA-9: vence justo en el límite y sigue vigente un segundo antes', () => {
    const token = issue();
    const oneSecondBefore = new Date(expiresAt.getTime() - 1000);

    expect(token.stateAt(expiresAt)).toBe('expired');
    expect(token.stateAt(oneSecondBefore)).toBe('valid');
    expect(token.isValid(oneSecondBefore)).toBe(true);
    expect(token.isValid(expiresAt)).toBe(false);
  });

  it('CA-8: consume e invalida en instancias nuevas y fallan si el token ya no es válido', () => {
    const original = issue();
    const consumed = original.consume(createdAt);
    const invalidated = original.invalidate(createdAt);

    expect(consumed).not.toBe(original);
    expect(invalidated).not.toBe(original);
    expect(consumed.usedAt).toEqual(createdAt);
    expect(invalidated.invalidatedAt).toEqual(createdAt);
    expect(original.usedAt).toBeNull();
    expect(original.invalidatedAt).toBeNull();
    expect(() => consumed.consume(createdAt)).toThrow(InvalidTokenTransitionError);
    expect(() => invalidated.invalidate(createdAt)).toThrow(InvalidTokenTransitionError);
    expect(() => original.consume(expiresAt)).toThrow(InvalidTokenTransitionError);
  });

  it.each(['verificacion', 'recuperacion', 'alta_interna'] as const)(
    '011 CA-5: emite un token de tipo %s',
    (type) => {
      const token = VerificationToken.issue({
        id: '11111111-2222-4333-8444-555555555555',
        userId: '66666666-7777-4888-8999-aaaaaaaaaaaa',
        type,
        tokenHash: 'a'.repeat(64),
        createdAt,
        expiresAt,
      });

      expect(token.type).toBe(type);
    },
  );
});
