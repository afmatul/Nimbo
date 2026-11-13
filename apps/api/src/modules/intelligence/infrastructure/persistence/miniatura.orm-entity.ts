import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Fila de `miniatura` (migración `CrearMiniaturaDeDocumento…`): el extracto de texto de una versión de `.docx`. */
@Entity('miniatura')
export class MiniaturaOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'archivo_id' })
  archivoId!: string;

  @Column('uuid', { name: 'version_archivo_id' })
  versionArchivoId!: string;

  @Column('text')
  texto!: string;

  @Column('timestamptz', { name: 'creado_en' })
  creadoEn!: Date;
}
