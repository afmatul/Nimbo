import { Inject, Injectable } from '@nestjs/common';

import { EditingUnavailableError } from '../domain/errors';

import { CONTENT_LINK_SIGNER } from './content-link.signer';
import type { ContentLinkSigner } from './content-link.signer';
import { EDITING_CONFIG } from './editing-config';
import type { EditingConfig } from './editing-config';
import { EditorConfigFactory } from './editor-config.factory';
import { I_DOCUMENT_EDITOR } from './ports/i-document-editor.port';
import type { IDocumentEditor } from './ports/i-document-editor.port';

/**
 * Puerta de la edición (CA-15, RNF-09, Art. XII): si faltan las variables de ONLYOFFICE o el servicio no responde,
 * abrir responde `EDITING_UNAVAILABLE` (503) y nada más se ve afectado. Si está, da la fábrica de configuraciones.
 */
@Injectable()
export class EditorAvailability {
  constructor(
    @Inject(EDITING_CONFIG) private readonly config: EditingConfig,
    @Inject(I_DOCUMENT_EDITOR) private readonly editor: IDocumentEditor,
    @Inject(CONTENT_LINK_SIGNER) private readonly links: ContentLinkSigner | null,
  ) {}

  async factory(): Promise<EditorConfigFactory> {
    const connection = this.config.onlyOffice;
    if (connection === null || this.links === null || !(await this.editor.isAvailable())) {
      throw new EditingUnavailableError();
    }
    return new EditorConfigFactory(connection, this.links, this.editor);
  }
}
