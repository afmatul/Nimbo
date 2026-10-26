import { Column, Entity, PrimaryColumn } from 'typeorm';

import { BIGINT_TRANSFORMER } from '../../../../shared';
import type { FileVersionOrigin } from '../../domain/file-version';

/** Fila de `version_archivo`. `clave_objeto` nunca sale de la API ni entra en una bitácora. */
@Entity('version_archivo')
export class VersionArchivoOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'archivo_id' })
  archivoId!: string;

  /** Consecutivo por archivo (014 CA-4); la versión actual es la de mayor número. */
  @Column('integer')
  numero!: number;

  /** Número de la versión de la que se restauró (014 CA-9); sin FK: sobrevive a su poda. */
  @Column('integer', { name: 'restaurada_de_numero', nullable: true })
  restauradaDeNumero!: number | null;

  @Column('varchar', { length: 12 })
  origen!: FileVersionOrigin;

  @Column('varchar', { name: 'clave_objeto', length: 200 })
  claveObjeto!: string;

  @Column('bigint', { name: 'tamano_bytes', transformer: BIGINT_TRANSFORMER })
  tamanoBytes!: bigint;

  @Column('uuid', { name: 'creado_por' })
  creadoPor!: string;

  @Column('timestamptz', { name: 'creada_en' })
  creadaEn!: Date;

  /** Sesión de edición que la generó (016); `UNIQUE` y solo en las de origen `edicion` (DF-05). */
  @Column('uuid', { name: 'sesion_edicion_id', nullable: true })
  sesionEdicionId!: string | null;

  /** Fecha de purga de un original conservado (014b); nula = cuenta en `espacio_usado`. */
  @Column('timestamptz', { name: 'conservada_hasta', nullable: true })
  conservadaHasta!: Date | null;
}
