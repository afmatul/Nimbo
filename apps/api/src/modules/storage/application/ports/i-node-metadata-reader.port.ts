import type { Actor } from '../../../../shared';
import type { FileKind } from '../../domain/file-kind';

/**
 * Metadatos de un archivo de un cliente para Soporte y Administración (011 CA-13): solo columnas de `archivo`, nunca
 * clave de objeto, versiones ni contenido (RN-1). `trashedAt` es `null` si el archivo está disponible.
 */
export interface FileMetadata {
  readonly id: string;
  readonly name: string;
  readonly kind: FileKind;
  readonly sizeBytes: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly trashedAt: Date | null;
}

/** Una página de metadatos con el total de archivos del dueño (DF-66). */
export interface FileMetadataPage {
  readonly items: readonly FileMetadata[];
  readonly total: number;
}

/** Qué página pedir: `page` desde 1 y `pageSize`, que fija quien consume (011 H-3). */
export interface FileMetadataPageRequest {
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Puerto que `storage` declara **e implementa** y consume `backoffice` (diagrama M8; 011 plan §2, cierra PD-31): sin
 * ciclo, porque `storage` no importa a quien lo usa. Exige la transacción de `withActor(actor)`: la política
 * `archivo_metadatos_internos` solo deja leer a `ADMIN` y `SUPPORT` (architecture §6). Del más reciente al más viejo;
 * incluye los de la papelera.
 */
export interface INodeMetadataReader {
  listForOwner(
    actor: Actor,
    ownerId: string,
    request: FileMetadataPageRequest,
  ): Promise<FileMetadataPage>;
}

export const I_NODE_METADATA_READER = Symbol('INodeMetadataReader');
