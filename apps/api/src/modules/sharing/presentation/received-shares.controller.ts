import { Controller, Delete, Get, Header, HttpCode, HttpStatus, Param } from '@nestjs/common';
import type { ReceivedShare, ReceivedShares } from '@nimbo/contracts';

import { CurrentActor, Role, Roles } from '../../../shared';
import type { Actor } from '../../../shared';
import { ReceivedSharesService } from '../application/received-shares.service';
import type { ReceivedShareView } from '../application/received-shares.service';

import { NO_STORE, shareIdPipe } from './sharing-http.constants';

const toReceivedShare = (view: ReceivedShareView): ReceivedShare => ({
  shareId: view.shareId,
  nodeType: view.node.type,
  nodeId: view.node.id,
  name: view.name,
  owner: { ...view.owner },
  level: view.level,
  createdAt: view.createdAt.toISOString(),
});

/**
 * «Compartidos conmigo» (plan 012 §4, CA-22). Solo `CLIENT`: un rol interno recibe `403 SHARED_FORBIDDEN` y sin token
 * `401`. Rutas bajo `shares/received`, aparte de `SharingController`: el `GET` no tiene `:shareId` y el `DELETE
 * /shares/:shareId` de un segmento no alcanza `received/:shareId`. Mapea y delega.
 */
@Roles(Role.CLIENT)
@Controller('shares/received')
export class ReceivedSharesController {
  constructor(private readonly received: ReceivedSharesService) {}

  /** CA-22: más recientes primero, sin paginar (S-8); `[]` si no hay. */
  @Get()
  @Header('Cache-Control', NO_STORE)
  async list(@CurrentActor() actor: Actor): Promise<ReceivedShares> {
    const views = await this.received.listReceived(actor);
    return { entries: views.map(toReceivedShare) };
  }

  /** CA-23, Salir: `204`; desde la siguiente petición el actor recibe `404` sobre el nodo (RN-6). */
  @Delete(':shareId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', NO_STORE)
  async leave(
    @CurrentActor() actor: Actor,
    @Param('shareId', shareIdPipe()) shareId: string,
  ): Promise<void> {
    await this.received.leave(actor, shareId);
  }
}
