import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Fila de `comparticion` (plan 012 §3, ADR-0011): un acceso directo de un cliente a un archivo **o** una carpeta de
 * otro, con nivel `VIEWER` o `EDITOR` (DF-31).
 */
@Entity('comparticion')
export class ComparticionOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'propietario_id' })
  propietarioId!: string;

  @Column('uuid', { name: 'destinatario_id' })
  destinatarioId!: string;

  @Column('uuid', { name: 'archivo_id', nullable: true })
  archivoId!: string | null;

  @Column('uuid', { name: 'carpeta_id', nullable: true })
  carpetaId!: string | null;

  @Column('varchar', { length: 8 })
  nivel!: string;

  @Column('timestamptz', { name: 'creado_en' })
  creadoEn!: Date;

  @Column('timestamptz', { name: 'actualizado_en' })
  actualizadoEn!: Date;
}
