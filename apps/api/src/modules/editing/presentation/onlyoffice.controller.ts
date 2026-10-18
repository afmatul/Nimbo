import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';

import { Public } from '../../../shared';
import { DocumentContentService } from '../application/document-content.service';
import { CALLBACK_LINK_PARAMETER } from '../application/editing-config';
import { SaveCallbackHandler } from '../application/save-callback.handler';
import type { CallbackAck } from '../application/save-callback.handler';

/** MIME de `.docx`; la descarga es forzada (Art. IX.7). */
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCX_DISPOSITION = 'attachment; filename="documento.docx"';
const BEARER_PREFIX = 'Bearer ';

const textOrEmpty = (value: unknown): string => (typeof value === 'string' ? value : '');

/** El JWT del aviso: en el cuerpo (`token`) o, si no viene ahí, en `Authorization: Bearer` (ONLYOFFICE admite ambos). */
const callbackTokenOf = (body: unknown, authorization: string | undefined): string => {
  const inBody = textOrEmpty((body as { token?: unknown } | null)?.token);
  if (inBody !== '' || authorization?.startsWith(BEARER_PREFIX) !== true) return inBody;
  return authorization.slice(BEARER_PREFIX.length);
};

/**
 * Rutas que llama ONLYOFFICE, sin token de usuario (plan 016 §4): `@Public()` y autenticadas por su propio JWT: el
 * contenido del documento por enlace firmado y el aviso de guardado (`callback`), que responde siempre `200` con
 * `{"error":0|1}`. Del cuerpo del aviso solo se usa el payload del JWT, nunca el cuerpo crudo. Sin caché.
 */
@Public()
@Controller('editing')
export class OnlyOfficeController {
  constructor(
    private readonly contents: DocumentContentService,
    private readonly callbacks: SaveCallbackHandler,
  ) {}

  /** `404` uniforme si el enlace no vale (CA-16); nunca el nombre del archivo ni la clave de objeto. */
  @Get('content/:token')
  @Header('Cache-Control', 'no-store')
  async content(@Param('token') token: string): Promise<StreamableFile> {
    const stream = await this.contents.contentFor(token);
    return new StreamableFile(stream, { type: DOCX_MIME, disposition: DOCX_DISPOSITION });
  }

  /** `{"error":1}` solo si la firma o el enlace no valen (CA-19); lo demás se acusa con `{"error":0}`. */
  @Post('callback')
  @HttpCode(HttpStatus.OK)
  callback(
    @Query(CALLBACK_LINK_PARAMETER) link: unknown,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined,
  ): Promise<CallbackAck> {
    return this.callbacks.handle({
      link: textOrEmpty(link),
      token: callbackTokenOf(body, authorization),
    });
  }
}
