import { Column, Entity, PrimaryColumn } from 'typeorm';

import { BIGINT_TRANSFORMER } from '../../../../shared';
import type { FileKind } from '../../domain/file-kind';

/**
 * Fila de `archivo` (migraciones `CrearArchivoYVersionArchivo…` de 005 y `CarpetaYPapeleraEnArchivoYCarga…` de 006).
 * Los bytes, siempre `bigint`. `carpeta_id` `NULL` es la raíz.
 */
@Entity('archivo')
export class ArchivoOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'propietario_id' })
  propietarioId!: string;

  @Column('uuid', { name: 'carpeta_id', nullable: true })
  carpetaId!: string | null;

  @Column('varchar', { length: 255 })
  nombre!: string;

  @Column('varchar', { length: 10 })
  tipo!: FileKind;

  @Column('bigint', { name: 'tamano_bytes', transformer: BIGINT_TRANSFORMER })
  tamanoBytes!: bigint;

  @Column('uuid', { name: 'version_actual_id' })
  versionActualId!: string;

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
