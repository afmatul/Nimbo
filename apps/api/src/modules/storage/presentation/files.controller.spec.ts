import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';

import { createActor, Role } from '../../../shared';
import type { FileService } from '../application/file.service';
import { File } from '../domain/file';
import { FileName } from '../domain/file-name.vo';

import { FilesController } from './files.controller';

const ACTOR = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const FILE_ID = '22222222-2222-4222-8222-222222222222';
const CREATED = new Date('2026-09-30T10:00:00.000Z');

function file(): File {
  const parsed = FileName.parse('informe.pdf');
  if (!parsed.ok) throw new Error('nombre de prueba inválido');
  return File.create({
    id: FILE_ID,
    ownerId: ACTOR.id,
    name: parsed.name,
    kind: 'pdf',
    sizeBytes: 2048n,
    currentVersionId: '33333333-3333-4333-8333-333333333333',
    now: CREATED,
  });
}

function setup() {
  const files = {
    list: jest.fn().mockResolvedValue({ items: [file()], nextCursor: 'c-2' }),
    getDownloadUrl: jest.fn().mockResolvedValue({
      url: 'https://s3.test/x',
      expiresAt: new Date('2026-09-30T10:05:00.000Z'),
    }),
  };
  const controller = new FilesController(files as unknown as FileService);
  return { files, controller };
}

describe('FilesController', () => {
  it('CA-15: `GET /files` delega con el actor y mapea cada archivo a `FileSummary`', async () => {
    const { files, controller } = setup();

    const response = await controller.list(ACTOR, { cursor: 'c-1', limit: 20 });

    expect(files.list).toHaveBeenCalledWith(ACTOR, { cursor: 'c-1', limit: 20 });
    expect(response).toEqual({
      items: [
        {
          id: FILE_ID,
          name: 'informe.pdf',
          sizeBytes: 2048,
          kind: 'pdf',
          createdAt: CREATED.toISOString(),
        },
      ],
      nextCursor: 'c-2',
    });
  });

  it('CA-15: sin cursor pide la primera página', async () => {
    const { files, controller } = setup();

    await controller.list(ACTOR, { limit: 50 });

    expect(files.list).toHaveBeenCalledWith(ACTOR, { limit: 50 });
  });

  it('CA-13: `POST /files/:id/download-url` responde 200 con la URL y su vencimiento en ISO', async () => {
    const { files, controller } = setup();

    const response = await controller.downloadUrl(ACTOR, FILE_ID);

    expect(files.getDownloadUrl).toHaveBeenCalledWith(ACTOR, FILE_ID);
    expect(response).toEqual({
      url: 'https://s3.test/x',
      expiresAt: '2026-09-30T10:05:00.000Z',
    });
    const handler = Object.getOwnPropertyDescriptor(FilesController.prototype, 'downloadUrl');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler?.value as object)).toBe(HttpStatus.OK);
  });
});
