import { Column, Entity, PrimaryColumn } from 'typeorm';

import { BIGINT_TRANSFORMER, Role } from '../../../../shared';
import { AccountStatus } from '../../domain/account-status.enum';

/**
 * Fila de `usuario` (E-R, plan §4): herencia de tabla única para clientes y cuentas internas, distinguidas por `rol`.
 * El esquema lo fija la migración `CrearUsuario…`; aquí solo se mapean las columnas que usa `identity`
 * (`creado_en` queda con su `DEFAULT`).
 */
@Entity('usuario')
export class UsuarioOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('varchar', { length: 100 })
  nombre!: string;

  @Column('varchar', { length: 254 })
  correo!: string;

  @Column('varchar', { name: 'hash_clave', length: 255 })
  hashClave!: string;

  @Column('varchar', { length: 16 })
  rol!: Role;

  @Column('varchar', { length: 16 })
  estado!: AccountStatus;

  @Column('boolean', { name: 'correo_verificado' })
  correoVerificado!: boolean;

  @Column('varchar', { name: 'version_terminos', length: 20, nullable: true })
  versionTerminos!: string | null;

  @Column('varchar', { name: 'version_privacidad', length: 20, nullable: true })
  versionPrivacidad!: string | null;

  @Column('timestamptz', { name: 'terminos_aceptados_en', nullable: true })
  terminosAceptadosEn!: Date | null;

  /** Código de empleado (011 RN-5): obligatorio y único en las internas, `NULL` en los clientes. */
  @Column('varchar', { name: 'codigo_empleado', length: 20, nullable: true })
  codigoEmpleado!: string | null;

  /**
   * Espacio usado (005, DF-38). Solo lo escribe `storage` por SQL (`IQuotaRepository`, D-5, DF-59): para `identity`
   * es de solo lectura, así ningún `insert`/`update` de este módulo lo pisa con un valor viejo.
   */
  @Column({
    type: 'bigint',
    name: 'espacio_usado',
    insert: false,
    update: false,
    transformer: BIGINT_TRANSFORMER,
  })
  espacioUsadoBytes!: bigint;
}
