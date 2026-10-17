import { Inject, Injectable } from '@nestjs/common';

import { TransactionContext } from '../../../../shared';
import type { Actor } from '../../../../shared';
import type {
  FileMetadata,
  FileMetadataPage,
  FileMetadataPageRequest,
  INodeMetadataReader,
} from '../../application/ports/i-node-metadata-reader.port';
import type { FileKind } from '../../domain/file-kind';

interface MetadataRow {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: FileKind;
  readonly tamano_bytes: string;
  readonly creado_en: Date;
  readonly actualizado_en: Date;
  readonly eliminado_en: Date | null;
}

/**
 * Solo columnas de `archivo`: nunca `version_archivo` (con `clave_objeto`) ni `carga` (las cargas en curso aún no
 * tienen fila aquí, 011 CA-13). `idx_archivo_propietario_actualizado` sirve al filtro y al orden.
 */
const PAGE_SQL = `SELECT id, nombre, tipo, tamano_bytes::text AS tamano_bytes, creado_en, actualizado_en, eliminado_en
  FROM archivo WHERE propietario_id = $1
  ORDER BY actualizado_en DESC, id DESC LIMIT $2 OFFSET $3`;
const TOTAL_SQL = 'SELECT count(*)::int AS total FROM archivo WHERE propietario_id = $1';

const toMetadata = (row: MetadataRow): FileMetadata => ({
  id: row.id,
  name: row.nombre,
  kind: row.tipo,
  sizeBytes: BigInt(row.tamano_bytes),
  createdAt: row.creado_en,
  updatedAt: row.actualizado_en,
  trashedAt: row.eliminado_en,
});

/**
 * `INodeMetadataReader` sobre Postgres (011 plan §2, §5). El dueño se filtra **en el SQL** y la RLS
 * (`archivo_metadatos_internos`) es la segunda barrera. Excepción a `accessibleNodes` (architecture §6): un rol interno
 * nunca tiene nodos accesibles; lee metadatos por política, sin contenido. Sin `withActor` lanza.
 */
@Injectable()
export class SqlNodeMetadataReader implements INodeMetadataReader {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async listForOwner(
    actor: Actor,
    ownerId: string,
    { page, pageSize }: FileMetadataPageRequest,
  ): Promise<FileMetadataPage> {
    const manager = this.context.requireActorScope(actor);
    const offset = (page - 1) * pageSize;
    const rows = (await manager.query(PAGE_SQL, [ownerId, pageSize, offset])) as MetadataRow[];
    const [count] = (await manager.query(TOTAL_SQL, [ownerId])) as { total: number }[];
    return { items: rows.map(toMetadata), total: count?.total ?? 0 };
  }
}
