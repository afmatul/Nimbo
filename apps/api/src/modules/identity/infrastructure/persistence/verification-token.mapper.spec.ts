import { VerificationToken } from '../../domain/verification-token.entity';

import type { TokenCuentaOrmEntity } from './token-cuenta.orm-entity';
import { toTokenCuentaRow, toVerificationTokenDomain } from './verification-token.mapper';

const CREATED_AT = new Date('2026-09-30T14:00:00.000Z');
const EXPIRES_AT = new Date('2026-10-01T14:00:00.000Z');
const USED_AT = new Date('2026-09-30T15:00:00.000Z');

const aToken = (): VerificationToken =>
  VerificationToken.issue({
    id: '00000000-0000-4000-8000-000000000001',
    userId: '6f1e0c3a-1b2d-4e5f-8a9b-0c1d2e3f4a5b',
    type: 'verificacion',
    tokenHash: 'a'.repeat(64),
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
  });

describe('verification-token.mapper', () => {
  it('CA-10: `toTokenCuentaRow` escribe las columnas de `token_cuenta`', () => {
    expect(toTokenCuentaRow(aToken())).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      usuarioId: '6f1e0c3a-1b2d-4e5f-8a9b-0c1d2e3f4a5b',
      tipo: 'verificacion',
      tokenHash: 'a'.repeat(64),
      expiraEn: EXPIRES_AT,
      usadoEn: null,
      invalidadoEn: null,
      creadoEn: CREATED_AT,
    });
  });

  it('CA-10: un token usado va y vuelve de la fila con su estado', () => {
    const used = aToken().consume(USED_AT);

    const back = toVerificationTokenDomain(toTokenCuentaRow(used));

    expect(back).toEqual(used);
    expect(back.stateAt(USED_AT)).toBe('used');
  });

  it('CA-11: una fila invalidada se lee como `invalidated`', () => {
    const row: TokenCuentaOrmEntity = { ...toTokenCuentaRow(aToken()), invalidadoEn: USED_AT };

    expect(toVerificationTokenDomain(row).stateAt(USED_AT)).toBe('invalidated');
  });
});
