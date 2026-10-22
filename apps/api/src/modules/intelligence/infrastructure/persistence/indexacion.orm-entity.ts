import { Column, Entity, PrimaryColumn } from 'typeorm';

import type { IndexingReason, IndexingState } from '../../domain/file-indexing';

/**
 * Fila de `indexacion` (migración `CrearIndexacionYFragmento…`, plan 019 §3): una por versión; `motivo` existe si y
 * solo si `estado` es `no_indexable` o `fallido`.
 */
@Entity('indexacion')
export class IndexacionOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'archivo_id' })
  archivoId!: string;

  @Column('uuid', { name: 'version_archivo_id' })
  versionArchivoId!: string;

  @Column('varchar', { length: 12 })
  estado!: IndexingState;

  @Column('varchar', { length: 30, nullable: true })
  motivo!: IndexingReason | null;

  @Column('smallint')
  intentos!: number;

  @Column('integer')
  fragmentos!: number;

  @Column('integer', { name: 'duracion_ms', nullable: true })
  duracionMs!: number | null;

  @Column('timestamptz', { name: 'creado_en' })
  creadoEn!: Date;

  @Column('timestamptz', { name: 'actualizado_en' })
  actualizadoEn!: Date;
}
