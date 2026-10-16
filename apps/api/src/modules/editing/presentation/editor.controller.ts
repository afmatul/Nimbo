import { Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import type { OpenEditSessionResponse } from '@nimbo/contracts';

import { CurrentActor, Role, Roles } from '../../../shared';
import type { Actor } from '../../../shared';
import { NodeNotFoundError } from '../../storage';
import { EditSessionService } from '../application/edit-session.service';

/** `:fileId` que no es UUID: el mismo 404 que un archivo inexistente o ajeno (CA-2, sin oráculo). */
const fileIdPipe = (): ParseUUIDPipe =>
  new ParseUUIDPipe({ exceptionFactory: () => new NodeNotFoundError() });

/**
 * Abrir un documento en el editor (plan 016 §4). Solo `CLIENT`: un rol interno recibe `SHARED_FORBIDDEN` antes de
 * tocar el archivo y no se registra participación (CA-17). Responde siempre `200` con un modo (spec §3).
 */
@Roles(Role.CLIENT)
@Controller('files/:fileId/edit-session')
export class EditorController {
  constructor(private readonly sessions: EditSessionService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async open(
    @CurrentActor() actor: Actor,
    @Param('fileId', fileIdPipe()) fileId: string,
  ): Promise<OpenEditSessionResponse> {
    const opened = await this.sessions.open(actor, fileId);
    return { ...opened, config: { ...opened.config }, participants: [...opened.participants] };
  }
}
