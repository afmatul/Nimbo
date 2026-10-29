import { randomUUID } from 'node:crypto';

import { FileVersionService } from '../../../src/modules/storage/application/file-version.service';
import { I_NODE_REPOSITORY } from '../../../src/modules/storage/application/ports/i-node.repository.port';
import type { INodeRepository } from '../../../src/modules/storage/application/ports/i-node.repository.port';
import { FileVersion } from '../../../src/modules/storage/domain/file-version';
import type { NewVersionInput } from '../../../src/modules/storage/domain/file-version';
import { ObjectKey } from '../../../src/modules/storage/domain/object-key';
import { createActor, I_TRANSACTION_RUNNER, Role } from '../../../src/shared';
import type { ITransactionRunner } from '../../../src/shared';

import { textBytes } from './storage-http';
import type { StorageClient, StorageHttpApp } from './storage-http';

/**
 * Versión nueva de `fileId`: su tamaño y, si hace de doble del origen `optimizacion` de 021 (014b), los días que se
 * conserva el original.
 */
export interface NextVersion {
  readonly fileId: string;
  readonly sizeBytes: number;
  readonly keepPreviousForDays?: number;
}

/** Una carga, o una optimización si trae los días de conservación (014b CA-1). */
const versionOf = (next: NextVersion, input: NewVersionInput): FileVersion =>
  next.keepPreviousForDays === undefined
    ? FileVersion.fromUpload(input)
    : FileVersion.forOrigin('optimizacion', input);

/**
 * Sube el contenido de una versión nueva a MinIO y la registra con `FileVersionService.register` dentro de `withActor`,
 * como `UploadRegistrar`, con su poda tras el commit (014 CA-13). Devuelve la versión registrada.
 */
export const registerVersion = async (
  storage: StorageHttpApp,
  client: StorageClient,
  next: NextVersion,
): Promise<FileVersion> => {
  const { app } = storage.testApp;
  const actor = createActor(client.id, Role.CLIENT);
  const service = app.get(FileVersionService);
  const nodes = app.get<INodeRepository>(I_NODE_REPOSITORY);
  const id = randomUUID();
  const objectKey = ObjectKey.of(client.id, next.fileId, id);
  await storage.putObject(objectKey.value, textBytes(next.sizeBytes));
  const input = { id, fileId: next.fileId, objectKey, sizeBytes: BigInt(next.sizeBytes) };
  const { keepPreviousForDays } = next;
  const kept = keepPreviousForDays === undefined ? {} : { keepPreviousForDays };
  const transactions = app.get<ITransactionRunner>(I_TRANSACTION_RUNNER);
  const registered = await transactions.withActor(actor, async () => {
    const file = await nodes.findAccessibleById(actor, next.fileId);
    if (file === null) throw new Error('El archivo no está vivo');
    const buildVersion = (number: number): FileVersion =>
      versionOf(next, { ...input, createdBy: client.id, number, now: new Date() });
    return service.register(actor, { file, buildVersion, ...kept });
  });
  await service.afterCommit(actor, registered);
  return registered.version;
};
