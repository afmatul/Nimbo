import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';

import { createActor, Role } from '../../../shared';
import type { UploadService } from '../application/upload.service';

import { UploadsController } from './uploads.controller';

const ACTOR = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const UPLOAD_ID = '44444444-4444-4444-8444-444444444444';

function setup() {
  const uploads = {
    init: jest.fn().mockResolvedValue({ uploadId: UPLOAD_ID }),
    resume: jest.fn().mockResolvedValue({ uploadId: UPLOAD_ID }),
    complete: jest.fn().mockResolvedValue({ file: { id: 'f' } }),
    cancel: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new UploadsController(uploads as unknown as UploadService);
  return { uploads, controller };
}

function httpCodeOf(method: keyof UploadsController): unknown {
  const handler = Object.getOwnPropertyDescriptor(UploadsController.prototype, method);
  return Reflect.getMetadata(HTTP_CODE_METADATA, handler?.value as object);
}

describe('UploadsController', () => {
  it('CA-1: `POST /uploads` delega el cuerpo validado con el actor y responde 201', async () => {
    const { uploads, controller } = setup();
    const body = { name: 'a.pdf', sizeBytes: 10, onConflict: 'ask' as const, folderId: null };

    await expect(controller.init(ACTOR, body)).resolves.toEqual({ uploadId: UPLOAD_ID });

    expect(uploads.init).toHaveBeenCalledWith(ACTOR, body);
    expect(httpCodeOf('init')).toBe(HttpStatus.CREATED);
  });

  it('CA-8: `resume` y `complete` delegan con el id y responden 200', async () => {
    const { uploads, controller } = setup();

    await controller.resume(ACTOR, UPLOAD_ID);
    await controller.complete(ACTOR, UPLOAD_ID);

    expect(uploads.resume).toHaveBeenCalledWith(ACTOR, UPLOAD_ID);
    expect(uploads.complete).toHaveBeenCalledWith(ACTOR, UPLOAD_ID);
    expect(httpCodeOf('resume')).toBe(HttpStatus.OK);
    expect(httpCodeOf('complete')).toBe(HttpStatus.OK);
  });

  it('CA-22: `DELETE /uploads/:id` cancela y responde 204 sin cuerpo', async () => {
    const { uploads, controller } = setup();

    await expect(controller.cancel(ACTOR, UPLOAD_ID)).resolves.toBeUndefined();

    expect(uploads.cancel).toHaveBeenCalledWith(ACTOR, UPLOAD_ID);
    expect(httpCodeOf('cancel')).toBe(HttpStatus.NO_CONTENT);
  });
});
