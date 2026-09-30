import type { FileSummary, InitUploadResponse, ResumeUploadResponse } from '@nimbo/contracts';

import { StorageRequestError } from '../storage-request-error';

import {
  UploadManager,
  type LocalFile,
  type UploadClient,
  type UploadManagerOptions,
} from './upload-manager';

const expiresAt = '2026-09-30T06:00:00.000Z';
const SIMPLE_ID = '00000000-0000-4000-8000-000000000001';
const PARTS_ID = '00000000-0000-4000-8000-000000000002';

type InitBody = Parameters<UploadClient['init']>[0];

function fileSummary(name: string, sizeBytes: number): FileSummary {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name,
    sizeBytes,
    kind: 'otro',
    createdAt: expiresAt,
  };
}

function simpleResponse(name: string, uploadId = SIMPLE_ID): InitUploadResponse {
  return {
    uploadId,
    mode: 'simple',
    name,
    expiresAt,
    upload: { url: `https://minio.local/${uploadId}`, method: 'PUT', expiresAt },
  };
}

function multipartResponse(name: string, parts: number, partSizeBytes: number): InitUploadResponse {
  return {
    uploadId: PARTS_ID,
    mode: 'multipart',
    name,
    expiresAt,
    partSizeBytes,
    totalParts: parts,
    parts: Array.from({ length: parts }, (_, index) => ({
      partNumber: index + 1,
      url: `https://minio.local/part-${index + 1}`,
    })),
    urlsExpireAt: expiresAt,
  };
}

function conflictOnAsk(body: InitBody): Promise<InitUploadResponse> {
  if (body.onConflict === 'ask') {
    return Promise.reject(
      new StorageRequestError(409, 'STORAGE_NAME_CONFLICT', { suggestedName: `(1) ${body.name}` }),
    );
  }
  return Promise.resolve(simpleResponse(`(1) ${body.name}`));
}

class FakeClient implements UploadClient {
  readonly inits: InitBody[] = [];
  readonly resumes: string[] = [];
  readonly cancels: string[] = [];
  readonly completes: string[] = [];
  initResult: (body: InitBody) => Promise<InitUploadResponse> = async (body) =>
    simpleResponse(body.name);
  resumeResult: () => Promise<ResumeUploadResponse> = async () => ({
    uploadId: SIMPLE_ID,
    mode: 'simple',
    expiresAt,
    completedParts: [],
    pending: { url: 'https://minio.local/resumed', method: 'PUT', expiresAt },
  });
  completeResult: (uploadId: string) => Promise<{ file: FileSummary }> = async () => ({
    file: fileSummary('guardado.txt', 3),
  });

  init(body: InitBody): Promise<InitUploadResponse> {
    this.inits.push(body);
    return this.initResult(body);
  }

  resume(uploadId: string): Promise<ResumeUploadResponse> {
    this.resumes.push(uploadId);
    return this.resumeResult();
  }

  complete(uploadId: string): Promise<{ file: FileSummary }> {
    this.completes.push(uploadId);
    return this.completeResult(uploadId);
  }

  async cancel(uploadId: string): Promise<void> {
    this.cancels.push(uploadId);
  }
}

function local(name: string, length = 3): LocalFile {
  const blob = new Blob([new Uint8Array(length)]);
  return { name, size: length, slice: (start, end) => blob.slice(start, end) };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

function managerWith(client: FakeClient, options: UploadManagerOptions = {}): UploadManager {
  return new UploadManager(client, { put: async () => undefined, ...options });
}

function onlyRow(
  manager: UploadManager,
): NonNullable<ReturnType<UploadManager['snapshot']>[number]> {
  const [row] = manager.snapshot();
  if (!row) throw new Error('No hay filas');
  return row;
}

describe('UploadManager: inicio, conflicto y subida', () => {
  it('CA-1: una carga simple pasa por starting → uploading → completing → done y el modo lo dice el servidor', async () => {
    const client = new FakeClient();
    const puts: string[] = [];
    const manager = managerWith(client, {
      put: async (request) => {
        puts.push(request.url);
        request.onProgress({ loadedBytes: 3, totalBytes: 3 });
      },
    });
    const phases: string[] = [];
    manager.subscribe(() => {
      const phase = manager.snapshot()[0]?.phase;
      if (phase && phases.at(-1) !== phase) phases.push(phase);
    });

    manager.enqueue([local('nota.txt')]);
    await manager.idle();

    expect(phases).toEqual(['queued', 'starting', 'uploading', 'completing', 'done']);
    expect(onlyRow(manager)).toMatchObject({
      mode: 'simple',
      loadedBytes: 3,
      file: fileSummary('guardado.txt', 3),
    });
    expect(client.inits).toEqual([{ name: 'nota.txt', sizeBytes: 3, onConflict: 'ask' }]);
    expect(puts).toEqual([`https://minio.local/${SIMPLE_ID}`]);
    expect(client.completes).toEqual([SIMPLE_ID]);
  });

  it('CA-1: no inicia más de dos archivos a la vez', async () => {
    const client = new FakeClient();
    const release: Array<() => void> = [];
    client.initResult = (body) =>
      new Promise((resolve) => {
        release.push(() => resolve(simpleResponse(body.name)));
      });
    const manager = managerWith(client);

    manager.enqueue([local('a.txt'), local('b.txt'), local('c.txt')]);
    await flush();

    expect(client.inits.map((call) => call.name)).toEqual(['a.txt', 'b.txt']);
    release[0]?.();
    await flush();
    expect(client.inits.map((call) => call.name)).toEqual(['a.txt', 'b.txt', 'c.txt']);
    release[1]?.();
    release[2]?.();
    await manager.idle();
    expect(manager.snapshot().every((row) => row.phase === 'done')).toBe(true);
  });

  it('CA-2: por partes sube cada trozo a su URL, con un máximo de cuatro a la vez', async () => {
    const client = new FakeClient();
    client.initResult = async (body) => multipartResponse(body.name, 6, 2);
    const sizes = new Map<string, number>();
    let active = 0;
    let maxActive = 0;
    const manager = managerWith(client, {
      put: async (request) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        sizes.set(request.url, (request.body as Blob).size);
        await flush();
        active -= 1;
      },
    });

    manager.enqueue([local('grande.bin', 11)]);
    await manager.idle();

    expect(maxActive).toBe(4);
    expect([...sizes.entries()].sort()).toEqual([
      ['https://minio.local/part-1', 2],
      ['https://minio.local/part-2', 2],
      ['https://minio.local/part-3', 2],
      ['https://minio.local/part-4', 2],
      ['https://minio.local/part-5', 2],
      ['https://minio.local/part-6', 1],
    ]);
    expect(onlyRow(manager)).toMatchObject({ phase: 'done', mode: 'multipart', loadedBytes: 11 });
  });

  it('CA-21: el progreso suma los bytes de las partes en vuelo', async () => {
    const client = new FakeClient();
    client.initResult = async (body) => multipartResponse(body.name, 2, 2);
    const seen: number[] = [];
    const manager = managerWith(client, {
      put: async (request) => {
        request.onProgress({ loadedBytes: 1, totalBytes: 2 });
        seen.push(manager.snapshot()[0]?.loadedBytes ?? -1);
        await flush();
      },
    });

    manager.enqueue([local('grande.bin', 4)]);
    await manager.idle();

    expect(seen).toEqual([1, 2]);
  });

  it('CA-6: un nombre repetido se detiene en conflict y no sube hasta «Conservar ambos»', async () => {
    const client = new FakeClient();
    client.initResult = conflictOnAsk;
    const puts: string[] = [];
    const manager = managerWith(client, {
      put: async (request) => {
        puts.push(request.url);
      },
    });

    manager.enqueue([local('nota.txt')]);
    await manager.idle();

    expect(onlyRow(manager)).toMatchObject({ phase: 'conflict', suggestedName: '(1) nota.txt' });
    expect(puts).toHaveLength(0);

    manager.resolveConflict(onlyRow(manager).id, 'keep_both');
    await manager.idle();

    expect(client.inits.map((call) => call.onConflict)).toEqual(['ask', 'keep_both']);
    expect(onlyRow(manager).phase).toBe('done');
  });

  it('CA-6: la fila toma el nombre del inicio y, al completar, el nombre final del servidor', async () => {
    const client = new FakeClient();
    client.initResult = conflictOnAsk;
    let release = (): void => undefined;
    client.completeResult = () =>
      new Promise((resolve) => {
        release = () => resolve({ file: fileSummary('(2) nota.txt', 3) });
      });
    const manager = managerWith(client);

    manager.enqueue([local('nota.txt')]);
    await manager.idle();
    manager.resolveConflict(onlyRow(manager).id, 'keep_both');
    await flush();

    expect(onlyRow(manager)).toMatchObject({ phase: 'completing', name: '(1) nota.txt' });
    release();
    await manager.idle();
    expect(onlyRow(manager)).toMatchObject({ phase: 'done', name: '(2) nota.txt' });
  });

  it('CA-6: «Cancelar» (descartar) no crea otra sesión', async () => {
    const client = new FakeClient();
    client.initResult = conflictOnAsk;
    const manager = managerWith(client);

    manager.enqueue([local('nota.txt')]);
    await manager.idle();
    manager.resolveConflict(onlyRow(manager).id, 'discard');
    await manager.idle();

    expect(client.inits).toHaveLength(1);
    expect(onlyRow(manager).phase).toBe('cancelled');
  });

  it('CA-6: «Aplicar a los demás» con «Conservar ambos» resuelve todos los repetidos de la selección', async () => {
    const client = new FakeClient();
    client.initResult = conflictOnAsk;
    const manager = managerWith(client);

    manager.enqueue([local('a.txt'), local('b.txt'), local('c.txt')]);
    await manager.idle();
    const first = manager.snapshot()[0]?.id ?? '';
    expect(manager.snapshot().map((row) => row.phase)).toEqual([
      'conflict',
      'conflict',
      'conflict',
    ]);
    expect(manager.pendingConflictsInBatch(first)).toBe(2);

    manager.resolveConflict(first, 'keep_both', true);
    await manager.idle();

    expect(manager.snapshot().map((row) => row.phase)).toEqual(['done', 'done', 'done']);
    expect(
      client.inits
        .filter((call) => call.onConflict === 'keep_both')
        .map((call) => call.name)
        .sort(),
    ).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('CA-6: «Aplicar a los demás» alcanza al repetido de la selección que aún no había respondido', async () => {
    const client = new FakeClient();
    let answerLate = (): void => undefined;
    client.initResult = (body) => {
      if (body.name !== 'c.txt' || body.onConflict !== 'ask') return conflictOnAsk(body);
      return new Promise((_resolve, reject) => {
        answerLate = () => reject(new StorageRequestError(409, 'STORAGE_NAME_CONFLICT', {}));
      });
    };
    const manager = managerWith(client);

    manager.enqueue([local('a.txt'), local('c.txt')]);
    await flush();
    expect(manager.snapshot().map((row) => row.phase)).toEqual(['conflict', 'starting']);
    manager.resolveConflict(manager.snapshot()[0]?.id ?? '', 'keep_both', true);
    answerLate();
    await manager.idle();

    expect(manager.snapshot().map((row) => row.phase)).toEqual(['done', 'done']);
    expect(client.inits.map((call) => [call.name, call.onConflict])).toEqual([
      ['a.txt', 'ask'],
      ['c.txt', 'ask'],
      ['a.txt', 'keep_both'],
      ['c.txt', 'keep_both'],
    ]);
  });

  it('CA-6: «Aplicar a los demás» no pasa a la selección siguiente', async () => {
    const client = new FakeClient();
    client.initResult = conflictOnAsk;
    const manager = managerWith(client);

    manager.enqueue([local('a.txt'), local('b.txt')]);
    await manager.idle();
    manager.resolveConflict(manager.snapshot()[0]?.id ?? '', 'discard', true);
    manager.enqueue([local('c.txt')]);
    await manager.idle();

    expect(manager.snapshot().map((row) => row.phase)).toEqual([
      'cancelled',
      'cancelled',
      'conflict',
    ]);
    expect(client.inits.every((call) => call.onConflict === 'ask')).toBe(true);
  });

  it('CA-6: un diálogo en espera no ocupa lugar: el siguiente archivo empieza', async () => {
    const client = new FakeClient();
    client.initResult = (body) =>
      body.name === 'c.txt' ? Promise.resolve(simpleResponse('c.txt')) : conflictOnAsk(body);
    const manager = managerWith(client);

    manager.enqueue([local('a.txt'), local('b.txt'), local('c.txt')]);
    await manager.idle();

    expect(manager.snapshot().map((row) => row.phase)).toEqual(['conflict', 'conflict', 'done']);
  });

  it('CA-3: un rechazo del inicio conserva code y details para el aviso de la fila', async () => {
    const client = new FakeClient();
    client.initResult = async () => {
      throw new StorageRequestError(422, 'STORAGE_FILE_TOO_LARGE', {
        sizeBytes: 3_000_000_000,
        maxBytes: 2_000_000_000,
      });
    };
    const manager = managerWith(client);

    manager.enqueue([local('video.mp4')]);
    expect(onlyRow(manager).errorDetails).toEqual({});
    await manager.idle();

    expect(onlyRow(manager)).toMatchObject({
      phase: 'rejected',
      errorCode: 'STORAGE_FILE_TOO_LARGE',
      errorDetails: { sizeBytes: 3_000_000_000, maxBytes: 2_000_000_000 },
    });
    expect(client.cancels).toEqual([]);
  });

  it('CA-11: un rechazo al completar deja la fila rechazada con el motivo', async () => {
    const client = new FakeClient();
    client.completeResult = async () => {
      throw new StorageRequestError(422, 'STORAGE_INVALID_FILE_TYPE', {
        reason: 'executable',
        extension: 'pdf',
      });
    };
    const manager = managerWith(client);

    manager.enqueue([local('factura.pdf')]);
    await manager.idle();

    expect(onlyRow(manager)).toMatchObject({
      phase: 'rejected',
      errorCode: 'STORAGE_INVALID_FILE_TYPE',
      errorDetails: { reason: 'executable' },
    });
  });

  it('CA-21: complete deja la fila en completing hasta que el servidor responde', async () => {
    const client = new FakeClient();
    let release = (): void => undefined;
    client.completeResult = () =>
      new Promise((resolve) => {
        release = () => resolve({ file: fileSummary('nota.txt', 3) });
      });
    const manager = managerWith(client);

    manager.enqueue([local('nota.txt')]);
    await flush();
    expect(onlyRow(manager)).toMatchObject({ phase: 'completing', loadedBytes: 3 });
    release();
    await manager.idle();
    expect(onlyRow(manager).phase).toBe('done');
  });

  it('CA-21: avisa a los suscriptores y conserva la referencia del snapshot sin cambios', async () => {
    const client = new FakeClient();
    const manager = managerWith(client);
    const listener = jest.fn();
    const unsubscribe = manager.subscribe(listener);

    manager.enqueue([local('nota.txt')]);
    await manager.idle();
    const before = manager.snapshot();

    expect(listener).toHaveBeenCalled();
    expect(manager.snapshot()).toBe(before);
    unsubscribe();
    listener.mockClear();
    manager.enqueue([local('otra.txt')]);
    await manager.idle();
    expect(listener).not.toHaveBeenCalled();
  });
});
