import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { EditableFileGateway } from '../../../src/modules/storage';
import type { EditedVersionInput, EditedVersionOutcome } from '../../../src/modules/storage';
import { createActor, Role } from '../../../src/shared';
import type { StorageClient, StorageHttpApp } from '../storage/storage-http';

import { docxBytes } from './docx-bytes';
import { insertEditSession } from './editing-test-db';

/** Un `.docx` subido por HTTP y una sesión de edición abierta sobre él (como el dueño de las tablas). */
export interface EditedDocument {
  readonly fileId: string;
  readonly sessionId: string;
}

/** Sube un `.docx` de `client` por HTTP y devuelve el archivo y su versión vigente. */
export const uploadDocx = async (
  storage: StorageHttpApp,
  client: StorageClient,
): Promise<{ fileId: string; versionId: string }> => {
  const uploaded = await client.upload(`informe-${randomUUID()}.docx`, docxBytes());
  if (uploaded.status !== 200) throw new Error(`Carga rechazada: ${String(uploaded.status)}`);
  const fileId = (uploaded.body as { file: { id: string } }).file.id;
  const [row] = await storage.owner.query<{ version_actual_id: string }[]>(
    'SELECT version_actual_id FROM archivo WHERE id = $1',
    [fileId],
  );
  return { fileId, versionId: row?.version_actual_id ?? '' };
};

/** Sube un `.docx` de `client` y abre una sesión sobre su versión vigente. */
export const uploadEditedDocument = async (
  storage: StorageHttpApp,
  client: StorageClient,
): Promise<EditedDocument> => {
  const { fileId, versionId } = await uploadDocx(storage, client);
  const file = { ownerId: client.id, fileId, versionId };
  return { fileId, sessionId: await insertEditSession(storage.owner, file) };
};

/** Lo que entregaría el editor al guardar la sesión: un `.docx` íntegro de `paddingBytes` de relleno. */
export const editedInput = (
  document: EditedDocument,
  createdBy: string,
  content: Buffer = docxBytes(),
): EditedVersionInput => ({
  fileId: document.fileId,
  versionId: randomUUID(),
  editSessionId: document.sessionId,
  createdBy,
  content: Readable.from([content]),
  sizeBytes: BigInt(content.length),
});

/** `registerEditedVersion` con el actor de la cuenta propietaria, como lo hará el procesador de `editing`. */
export const registerAsOwner = (
  storage: StorageHttpApp,
  ownerId: string,
  input: EditedVersionInput,
): Promise<EditedVersionOutcome> =>
  storage.testApp.app
    .get(EditableFileGateway)
    .registerEditedVersion(createActor(ownerId, Role.CLIENT), input);
