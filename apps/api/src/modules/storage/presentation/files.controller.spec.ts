import { HttpStatus } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';

import { createActor, Role } from '../../../shared';
import type { ExplorerBadgeService } from '../application/explorer-badge.service';
import type { FileService } from '../application/file.service';
import { File } from '../domain/file';
import { FileName } from '../domain/file-name.vo';

import { FilesController } from './files.controller';

const ACTOR = createActor('11111111-1111-4111-8111-111111111111', Role.CLIENT);
const FILE_ID = '22222222-2222-4222-8222-222222222222';
const CREATED = new Date('2026-09-30T10:00:00.000Z');
const SUMMARY = {
  id: FILE_ID,
  name: 'informe.pdf',
  sizeBytes: 2048,
  kind: 'pdf',
  folderId: null,
  createdAt: CREATED.toISOString(),
  updatedAt: CREATED.toISOString(),
};
const EXPLORER_FILE = { type: 'file', ...SUMMARY, shared: true, indexStatus: 'indexed' };

function file(): File {
  const parsed = FileName.parse('informe.pdf');
  if (!parsed.ok) throw new Error('nombre de prueba inválido');
  return File.create({
    id: FILE_ID,
    ownerId: ACTOR.id,
    folderId: null,
    name: parsed.name,
    kind: 'pdf',
    sizeBytes: 2048n,
    currentVersionId: '33333333-3333-4333-8333-333333333333',
    now: CREATED,
  });
}

function setup() {
  const files = {
    rename: jest.fn().mockResolvedValue(file()),
    move: jest.fn().mockResolvedValue(file()),
    getDetail: jest.fn().mockResolvedValue({ file: file(), accessLevel: 'VIEWER' }),
    getDownloadUrl: jest.fn().mockResolvedValue({
      url: 'https://s3.test/x',
      expiresAt: new Date('2026-09-30T10:05:00.000Z'),
    }),
  };
  const badges = {
    badgesOf: jest.fn().mockResolvedValue({
      shared: new Set([FILE_ID]),
      indexStatus: new Map([[FILE_ID, 'indexed']]),
    }),
  };
  const controller = new FilesController(
    files as unknown as FileService,
    badges as unknown as ExplorerBadgeService,
  );
  return { files, badges, controller };
}

describe('FilesController', () => {
  it('012 CA-12: `GET /files/:id` delega con el actor y responde `{ file: FileSummary, accessLevel }`', async () => {
    const { files, controller } = setup();

    const response = await controller.detail(ACTOR, FILE_ID);

    expect(files.getDetail).toHaveBeenCalledWith(ACTOR, FILE_ID);
    expect(response).toEqual({ file: SUMMARY, accessLevel: 'VIEWER' });
  });

  it('CA-4: `PATCH /files/:id` delega con el actor y responde el archivo con sus distintivos, como el listado', async () => {
    const { files, badges, controller } = setup();

    const response = await controller.rename(ACTOR, FILE_ID, {
      name: 'informe.pdf',
      onConflict: 'keep_both',
    });

    expect(files.rename).toHaveBeenCalledWith(ACTOR, FILE_ID, {
      name: 'informe.pdf',
      onConflict: 'keep_both',
    });
    expect(badges.badgesOf).toHaveBeenCalledWith(ACTOR, [expect.objectContaining({ id: FILE_ID })]);
    expect(response).toEqual(EXPLORER_FILE);
  });

  it('CA-7: `POST /files/:id/move` delega con el actor y responde 200 con el archivo y sus distintivos', async () => {
    const { files, controller } = setup();

    const response = await controller.move(ACTOR, FILE_ID, { folderId: null, onConflict: 'ask' });

    expect(files.move).toHaveBeenCalledWith(ACTOR, FILE_ID, { folderId: null, onConflict: 'ask' });
    expect(response).toEqual(EXPLORER_FILE);
    const handler = Object.getOwnPropertyDescriptor(FilesController.prototype, 'move');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler?.value as object)).toBe(HttpStatus.OK);
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
