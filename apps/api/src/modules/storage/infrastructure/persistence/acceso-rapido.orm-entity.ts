import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Fila de `acceso_rapido` (migración `CrearAccesoRapido…`, plan 006 §9.2). Exactamente uno de `archivoId` y
 * `carpetaId` (`ck_acceso_un_nodo`); fijado ⇔ `fijadoEn` no nulo, y al menos una de las dos marcas (`ck_acceso_util`).
 */
@Entity('acceso_rapido')
export class AccesoRapidoOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'usuario_id' })
  usuarioId!: string;

  @Column('uuid', { name: 'archivo_id', nullable: true })
  archivoId!: string | null;

  @Column('uuid', { name: 'carpeta_id', nullable: true })
  carpetaId!: string | null;

  @Column('timestamptz', { name: 'fijado_en', nullable: true })
  fijadoEn!: Date | null;

  @Column('timestamptz', { name: 'abierto_en', nullable: true })
  abiertoEn!: Date | null;

  @Column('timestamptz', { name: 'creado_en' })
  creadoEn!: Date;

  @Column('timestamptz', { name: 'actualizado_en' })
  actualizadoEn!: Date;
}
