import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { initUploadSchema } from '@nimbo/contracts';
import type {
  CompleteUploadResponse,
  InitUploadInput,
  InitUploadResponse,
  ResumeUploadResponse,
} from '@nimbo/contracts';

import { CurrentActor, Role, Roles, ZodValidationPipe } from '../../../shared';
import type { Actor } from '../../../shared';
import { UploadService } from '../application/upload.service';

import { storageUploadValidationError, uploadIdPipe } from './storage-validation';

/**
 * Ciclo de una carga (plan §5): valida la forma, delega en `UploadService` y devuelve el contrato. Solo `CLIENT`
 * (CA-17). Un `:uploadId` que no es UUID responde el mismo 404 que uno inexistente (CA-16).
 */
@Roles(Role.CLIENT)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  init(
    @CurrentActor() actor: Actor,
    @Body(new ZodValidationPipe(initUploadSchema, storageUploadValidationError))
    body: InitUploadInput,
  ): Promise<InitUploadResponse> {
    return this.uploads.init(actor, body);
  }

  @Post(':uploadId/resume')
  @HttpCode(HttpStatus.OK)
  resume(
    @CurrentActor() actor: Actor,
    @Param('uploadId', uploadIdPipe()) uploadId: string,
  ): Promise<ResumeUploadResponse> {
    return this.uploads.resume(actor, uploadId);
  }

  @Post(':uploadId/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentActor() actor: Actor,
    @Param('uploadId', uploadIdPipe()) uploadId: string,
  ): Promise<CompleteUploadResponse> {
    return this.uploads.complete(actor, uploadId);
  }

  /** Cancelar dos veces: la segunda es 404 y el cliente la trata como éxito (CA-22). */
  @Delete(':uploadId')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(
    @CurrentActor() actor: Actor,
    @Param('uploadId', uploadIdPipe()) uploadId: string,
  ): Promise<void> {
    return this.uploads.cancel(actor, uploadId);
  }
}
