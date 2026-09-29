import { Column, Entity, PrimaryColumn } from 'typeorm';

import type { VerificationTokenType } from '../../domain/verification-token.entity';

/**
 * Fila de `token_cuenta` (E-R, plan §4; `invalidado_en` y `creado_en` por DF-53). Guarda el SHA-256 del token, nunca
 * el valor (D-19). El esquema lo fija la migración `CrearTokenCuenta…`.
 */
@Entity('token_cuenta')
export class TokenCuentaOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'usuario_id' })
  usuarioId!: string;

  @Column('varchar', { length: 16 })
  tipo!: VerificationTokenType;

  @Column('char', { name: 'token_hash', length: 64 })
  tokenHash!: string;

  @Column('timestamptz', { name: 'expira_en' })
  expiraEn!: Date;

  @Column('timestamptz', { name: 'usado_en', nullable: true })
  usadoEn!: Date | null;

  @Column('timestamptz', { name: 'invalidado_en', nullable: true })
  invalidadoEn!: Date | null;

  @Column('timestamptz', { name: 'creado_en' })
  creadoEn!: Date;
}
