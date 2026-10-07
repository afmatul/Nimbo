import { Injectable } from '@nestjs/common';
import type { FileSummary } from '@nimbo/contracts';

import { InsufficientRoleError } from '../../../shared';
import type { Actor } from '../../../shared';
import { PreviewUnsupportedError } from '../domain/errors';
import type { File } from '../domain/file';
import type { FileKind } from '../domain/file-kind';

import { AccessibleFileUrlIssuer } from './accessible-file-url-issuer';
import { toFileSummary } from './file-summary';

/** Tipos con vista previa (017 RN-1); `docx` y `otro` (SVG, BMP, HEIC…) quedan fuera. */
const PREVIEWABLE_KINDS: ReadonlySet<FileKind> = new Set([
  'pdf',
  'xlsx',
  'pptx',
  'texto',
  'imagen',
]);

/** Archivo tal como lo ve el cliente y URL firmada para leer sus bytes desde el origen de objetos (017 CA-11). */
export interface PreviewDelivery {
  readonly file: FileSummary;
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
    const file = await this.issuer.resolve(actor, fileId);
    assertPreviewable(file);
    const { url, expiresAt } = await this.issuer.sign(file);
    return { file: toFileSummary(file), url, expiresAt };
  }
}

function assertPreviewable(file: File): void {
  if (!PREVIEWABLE_KINDS.has(file.kind)) throw new PreviewUnsupportedError();
}
