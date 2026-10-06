import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Fila de `carpeta` (migración `CrearCarpeta…`, plan 006 §3). `ruta` es el camino materializado `/<id>/…/<id>/`;
 * `eliminado_con_carpeta_id` señala la carpeta cuya eliminación arrastró a esta.
 */
@Entity('carpeta')
export class CarpetaOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'propietario_id' })
  propietarioId!: string;

  @Column('uuid', { name: 'carpeta_padre_id', nullable: true })
  carpetaPadreId!: string | null;

  @Column('varchar', { length: 255 })
  nombre!: string;

  @Column('text')
  ruta!: string;

  @Column('smallint')
  profundidad!: number;

  @Column('timestamptz', { name: 'creado_en' })
  creadoEn!: Date;

  @Column('timestamptz', { name: 'actualizado_en' })
  actualizadoEn!: Date;

  @Column('timestamptz', { name: 'eliminado_en', nullable: true })
  eliminadoEn!: Date | null;

  @Column('timestamptz', { name: 'purgar_en', nullable: true })
  purgarEn!: Date | null;

  @Column('uuid', { name: 'eliminado_con_carpeta_id', nullable: true })
  eliminadoConCarpetaId!: string | null;
}
