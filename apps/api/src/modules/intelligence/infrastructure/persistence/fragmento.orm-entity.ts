import { Column, Entity, PrimaryColumn } from 'typeorm';

import type { ChunkLocationJson } from '../../application/ports/i-chunk-repository.port';

/** Dimensión de `fragmento.embedding` (plan 019 §3, `outputDimensionality` del proveedor). */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * Fila de `fragmento` (migración `CrearIndexacionYFragmento…`, plan 019 §3). `textoBusq` lo genera la BD y no se
 * escribe ni se lee por defecto; `TypeOrmChunkRepository` usa SQL propio para el vector y la búsqueda.
 */
@Entity('fragmento')
export class FragmentoOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'archivo_id' })
  archivoId!: string;

  @Column('uuid', { name: 'version_archivo_id' })
  versionArchivoId!: string;

  @Column('integer')
  orden!: number;

  @Column('text')
  texto!: string;

  @Column('jsonb')
  procedencia!: ChunkLocationJson;

  @Column('vector', { length: EMBEDDING_DIMENSIONS })
  embedding!: number[];

  @Column({ type: 'tsvector', name: 'texto_busq', select: false, insert: false, update: false })
  textoBusq!: string;

  @Column('timestamptz', { name: 'creado_en' })
  creadoEn!: Date;
}
