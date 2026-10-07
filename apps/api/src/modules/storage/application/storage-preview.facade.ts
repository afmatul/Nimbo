import { Injectable } from '@nestjs/common';

import { InsufficientRoleError } from '../../../shared';
import type { Actor } from '../../../shared';
import { PreviewUnsupportedError } from '../domain/errors';
import type { File } from '../domain/file';
import type { FileKind } from '../domain/file-kind';

import { AccessibleFileUrlIssuer } from './accessible-file-url-issuer';

/** Tipos con vista previa (017 RN-1); `docx` y `otro` (SVG, BMP, HEIC…) quedan fuera. */
const PREVIEWABLE_KINDS: ReadonlySet<FileKind> = new Set([
  'pdf',
  'xlsx',
  'pptx',
  'texto',
  'imagen',
]);

/** Proyección mínima del archivo para la vista previa, compatible con `FileSummary` (017 plan §2.3). */
export interface PreviewFile {
  readonly id: string;
  readonly name: string;
  readonly kind: FileKind;
  readonly folderId: string | null;
  readonly sizeBytes: bigint;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Archivo y URL firmada para leer sus bytes desde el origen de objetos (017 CA-11). */
export interface PreviewDelivery {
  readonly file: PreviewFile;
  readonly url: string;
  readonly expiresAt: Date;
}

/**
 * Fachada pública de `storage` para la vista previa (017 plan §2.3, Q-2): reutiliza el resolver y firmador de la
 * descarga, sin tasa ni auditoría (las decide `PreviewService`). Deniega roles internos también en invocación directa.
 */
@Injectable()
export class StoragePreviewFacade {
  constructor(private readonly issuer: AccessibleFileUrlIssuer) {}

  /** 403 a roles internos (CA-4); ajeno o inexistente, 404 (CA-3); tipo sin vista previa, 422 (CA-11). */
  async issueUrl(actor: Actor, fileId: string): Promise<PreviewDelivery> {
    if (!actor.canReadContent) throw new InsufficientRoleError();
    const { file, url, expiresAt } = await this.issuer.issue(actor, fileId, assertPreviewable);
    return { file: toPreviewFile(file), url, expiresAt };
  }
}

function assertPreviewable(file: File): void {
  if (!PREVIEWABLE_KINDS.has(file.kind)) throw new PreviewUnsupportedError();
}

function toPreviewFile(file: File): PreviewFile {
  return {
    id: file.id,
    name: file.name.value,
    kind: file.kind,
    folderId: file.folderId,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}
