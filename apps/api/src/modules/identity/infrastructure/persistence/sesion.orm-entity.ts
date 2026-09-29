import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Fila de `sesion` (plan §4, DF-57). Guarda el SHA-256 del secreto de refresco vigente y del anterior, nunca el
 * valor (R-3). El esquema lo fija la migración `CrearSesion…`.
 */
@Entity('sesion')
export class SesionOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'usuario_id' })
  usuarioId!: string;

  @Column('uuid', { name: 'dispositivo_id' })
  dispositivoId!: string;

  @Column('char', { name: 'refresh_hash', length: 64 })
  refreshHash!: string;

  @Column('char', { name: 'refresh_anterior_hash', length: 64, nullable: true })
  refreshAnteriorHash!: string | null;

  @Column('timestamptz', { name: 'rotado_en', nullable: true })
  rotadoEn!: Date | null;

  @Column('timestamptz', { name: 'creada_en' })
  creadaEn!: Date;

  @Column('timestamptz', { name: 'ultimo_uso' })
  ultimoUso!: Date;

  @Column('timestamptz', { name: 'expira_en' })
  expiraEn!: Date;

  @Column('timestamptz', { name: 'revocada_en', nullable: true })
  revocadaEn!: Date | null;
}
