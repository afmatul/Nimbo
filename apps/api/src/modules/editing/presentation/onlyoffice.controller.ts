import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';

import { Public } from '../../../shared';
import { DocumentContentService } from '../application/document-content.service';

/** MIME de `.docx`; la descarga es forzada (Art. IX.7). */
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCX_DISPOSITION = 'attachment; filename="documento.docx"';

/**
 * Rutas que llama ONLYOFFICE, sin token de usuario (plan 016 §4): `@Public()` y autenticadas por su propio JWT. Desde
 * T-03, el contenido del documento por enlace firmado; el aviso de guardado (`callback`) llega con T-05. Sin caché.
 */
@Public()
@Controller('editing')
export class OnlyOfficeController {
  constructor(private readonly contents: DocumentContentService) {}

  /** `404` uniforme si el enlace no vale (CA-16); nunca el nombre del archivo ni la clave de objeto. */
  @Get('content/:token')
  @Header('Cache-Control', 'no-store')
  async content(@Param('token') token: string): Promise<StreamableFile> {
    const stream = await this.contents.contentFor(token);
    return new StreamableFile(stream, { type: DOCX_MIME, disposition: DOCX_DISPOSITION });
  }
}
