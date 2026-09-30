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
}
