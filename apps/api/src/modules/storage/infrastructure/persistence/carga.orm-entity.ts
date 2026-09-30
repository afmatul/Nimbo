import { Column, Entity, PrimaryColumn } from 'typeorm';

import { BIGINT_TRANSFORMER } from '../../../../shared';
import type { UploadMode, UploadRejectionReason, UploadState } from '../../domain/upload-session';

/**
 * Fila de `carga` (migración `CrearCarga…`): la sesión y, mientras está `activa`, la reserva de cuota. `nombre`,
 * `clave_objeto` y `upload_id` nunca salen de la API ni entran en una bitácora.
 */
@Entity('carga')
export class CargaOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'propietario_id' })
  propietarioId!: string;

  @Column('varchar', { length: 255 })
  nombre!: string;

  @Column('boolean', { name: 'conservar_ambos' })
  conservarAmbos!: boolean;

  @Column('bigint', { name: 'tamano_bytes', transformer: BIGINT_TRANSFORMER })
  tamanoBytes!: bigint;

  @Column('varchar', { length: 10 })
  modo!: UploadMode;

  @Column('varchar', { length: 10 })
  estado!: UploadState;

  @Column('varchar', { name: 'motivo_rechazo', length: 14, nullable: true })
  motivoRechazo!: UploadRejectionReason | null;

  @Column('uuid', { name: 'archivo_id' })
  archivoId!: string;

  @Column('uuid', { name: 'version_id' })
  versionId!: string;

  @Column('varchar', { name: 'clave_objeto', length: 200 })
  claveObjeto!: string;

  @Column('varchar', { name: 'upload_id', length: 200, nullable: true })
  uploadId!: string | null;

  @Column('integer', { name: 'partes_totales', nullable: true })
  partesTotales!: number | null;

  @Column('bigint', {
    name: 'tamano_parte_bytes',
    nullable: true,
    transformer: BIGINT_TRANSFORMER,
  })
  tamanoParteBytes!: bigint | null;

  @Column('timestamptz', { name: 'expira_en' })
  expiraEn!: Date;

  @Column('timestamptz', { name: 'creada_en' })
  creadaEn!: Date;

  @Column('timestamptz', { name: 'actualizada_en' })
  actualizadaEn!: Date;

  @Column('timestamptz', { name: 'finalizada_en', nullable: true })
  finalizadaEn!: Date | null;
}
