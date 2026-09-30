import { Column, Entity, PrimaryColumn } from 'typeorm';

import { BIGINT_TRANSFORMER } from '../../../../shared';
import type { FileKind } from '../../domain/file-kind';

/** Fila de `archivo` (migración `CrearArchivoYVersionArchivo…`, plan §4). Los bytes, siempre `bigint`. */
@Entity('archivo')
export class ArchivoOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'propietario_id' })
  propietarioId!: string;

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
}
