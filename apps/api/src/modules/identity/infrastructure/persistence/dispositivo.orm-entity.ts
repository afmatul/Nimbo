import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Fila de `dispositivo` (plan §4). Guarda el SHA-256 del identificador de la cookie, nunca el valor (D-4, R-3). El
 * esquema lo fija la migración `CrearDispositivo…`.
 */
@Entity('dispositivo')
export class DispositivoOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'usuario_id' })
  usuarioId!: string;

  @Column('char', { name: 'huella_hash', length: 64 })
  huellaHash!: string;

  @Column('varchar', { name: 'agente_usuario', length: 512 })
  agenteUsuario!: string;

  @Column('inet', { name: 'ultima_ip', nullable: true })
  ultimaIp!: string | null;

  @Column('timestamptz', { name: 'ultimo_acceso' })
  ultimoAcceso!: Date;
}
