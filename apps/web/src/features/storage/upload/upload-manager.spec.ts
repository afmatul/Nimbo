import type { FileSummary, InitUploadResponse, ResumeUploadResponse } from '@nimbo/contracts';

import { StorageRequestError } from '../storage-request-error';

import {
  UploadManager,
  type LocalFile,
  type UploadClient,
  type UploadManagerOptions,
} from './upload-manager';
import { XhrPutFailedError, type PutObjectRequest } from './xhr-put';

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

function abortError(): Error {
  const error = new Error('abort');
  error.name = 'AbortError';
  return error;
}

/** `PUT` que no termina hasta que se aborta (o hasta `release`). */
function hangingPut(puts: string[] = []): {
  readonly put: (request: PutObjectRequest) => Promise<void>;
  readonly release: () => void;
} {
  const pending: Array<() => void> = [];
  return {
    put: (request) => {
      puts.push(request.url);
      return new Promise((resolve, reject) => {
        pending.push(resolve);
        request.signal?.addEventListener('abort', () => reject(abortError()));
      });
    },
    release: () => pending.splice(0).forEach((resolve) => resolve()),
  };
}

function managerWith(client: FakeClient, options: UploadManagerOptions = {}): UploadManager {
  return new UploadManager(client, {
    put: async () => undefined,
    sleep: async () => undefined,
    ...options,
  });
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

describe('UploadManager: pausa, reanudación, corte y cancelación', () => {
  const partsResumed = async (): Promise<ResumeUploadResponse> => ({
    uploadId: PARTS_ID,
    mode: 'multipart',
    expiresAt,
    completedParts: [{ partNumber: 1, sizeBytes: 2 }],
    pending: {
      partSizeBytes: 2,
      totalParts: 2,
      parts: [{ partNumber: 2, url: 'https://minio.local/only-2' }],
      urlsExpireAt: expiresAt,
    },
  });

  function sequentialIds(): () => string {
    let next = 0;
    return () => {
      next += 1;
      return `local-${String(next)}`;
    };
  }

  it('CA-22: pausar una simple aborta el PUT, marca «Se reiniciará al reanudar» y al reanudar empieza de cero', async () => {
    const client = new FakeClient();
    const puts: string[] = [];
    const hanging = hangingPut(puts);
    const manager = managerWith(client, {
      put: (request) => {
        request.onProgress({ loadedBytes: 2, totalBytes: 3 });
        return hanging.put(request);
      },
    });

    manager.enqueue([local('nota.txt')]);
    await flush();
    manager.pause(onlyRow(manager).id);

    expect(onlyRow(manager)).toMatchObject({
      phase: 'paused',
      restartsOnResume: true,
      loadedBytes: 2,
    });
    await flush();
    expect(client.cancels).toEqual([]);

    manager.resume(onlyRow(manager).id);
    await flush();
    expect(client.resumes).toEqual([SIMPLE_ID]);
    expect(puts).toEqual([`https://minio.local/${SIMPLE_ID}`, 'https://minio.local/resumed']);
    expect(onlyRow(manager)).toMatchObject({ phase: 'uploading', restartsOnResume: false });
    hanging.release();
    await manager.idle();
    expect(onlyRow(manager).phase).toBe('done');
  });

  it('CA-8: reanudar por partes pide resume y solo sube las faltantes, desde los bytes ya completos', async () => {
    const client = new FakeClient();
    client.initResult = async (body) => multipartResponse(body.name, 2, 2);
    client.resumeResult = partsResumed;
    const puts: string[] = [];
    const hanging = hangingPut(puts);
    const manager = managerWith(client, { put: hanging.put });

    manager.enqueue([local('grande.bin', 4)]);
    await flush();
    manager.pause(onlyRow(manager).id);
    expect(onlyRow(manager)).toMatchObject({ phase: 'paused', restartsOnResume: false });

    manager.resume(onlyRow(manager).id);
    await flush();
    expect(onlyRow(manager).loadedBytes).toBe(2);
    hanging.release();
    await manager.idle();

    expect(client.resumes).toEqual([PARTS_ID]);
    expect(puts).toEqual([
      'https://minio.local/part-1',
      'https://minio.local/part-2',
      'https://minio.local/only-2',
    ]);
    expect(onlyRow(manager)).toMatchObject({ phase: 'done', loadedBytes: 4 });
  });

  it('CA-8: pausada no ocupa lugar: el siguiente archivo de la cola empieza', async () => {
    const client = new FakeClient();
    const manager = managerWith(client, { put: hangingPut().put });

    manager.enqueue([local('a.txt'), local('b.txt'), local('c.txt')]);
    await flush();
    manager.pause(manager.snapshot()[0]?.id ?? '');
    await flush();

    expect(client.inits.map((call) => call.name)).toEqual(['a.txt', 'b.txt', 'c.txt']);
  });

  it('CA-8: pausar mientras se inicia conserva la sesión y al reanudar la retoma', async () => {
    const client = new FakeClient();
    let answer = (): void => undefined;
    client.initResult = (body) =>
      new Promise((resolve) => {
        answer = () => resolve(simpleResponse(body.name));
      });
    const manager = managerWith(client);

    manager.enqueue([local('nota.txt')]);
    manager.pause(onlyRow(manager).id);
    answer();
    await manager.idle();
    expect(onlyRow(manager)).toMatchObject({ phase: 'paused', restartsOnResume: true });
    expect(client.cancels).toEqual([]);

    manager.resume(onlyRow(manager).id);
    await manager.idle();
    expect(client.resumes).toEqual([SIMPLE_ID]);
    expect(onlyRow(manager).phase).toBe('done');
  });

  it('CA-8: un corte de red deja la carga «en espera» y el evento online llama a resume', async () => {
    const client = new FakeClient();
    let attempts = 0;
    const manager = managerWith(client, {
      isOnline: () => false,
      put: async () => {
        attempts += 1;
        if (attempts === 1) throw new XhrPutFailedError(0);
      },
    });

    manager.enqueue([local('nota.txt')]);
    await manager.idle();
    expect(onlyRow(manager)).toMatchObject({ phase: 'offline', restartsOnResume: true });

    manager.networkOnline();
    await manager.idle();

    expect(client.resumes).toEqual([SIMPLE_ID]);
    expect(onlyRow(manager).phase).toBe('done');
  });

  it('CA-8: el evento offline detiene lo que se envía y deja quietas las pausadas', async () => {
    const client = new FakeClient();
    client.initResult = async (body) =>
      simpleResponse(body.name, body.name === 'a.txt' ? SIMPLE_ID : PARTS_ID);
    const aborted: string[] = [];
    const manager = managerWith(client, {
      createId: sequentialIds(),
      put: (request) =>
        new Promise((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => {
            aborted.push(request.url);
            reject(abortError());
          });
        }),
    });

    manager.enqueue([local('a.txt'), local('b.txt')]);
    await flush();
    manager.pause('local-2');
    manager.networkOffline();

    expect(manager.snapshot().map((row) => row.phase)).toEqual(['offline', 'paused']);
    expect(aborted).toEqual([
      `https://minio.local/${PARTS_ID}`,
      `https://minio.local/${SIMPLE_ID}`,
    ]);
  });

  it('CA-8: un fallo de red con el navegador en línea se reintenta como cualquier otro', async () => {
    const client = new FakeClient();
    let attempts = 0;
    const manager = managerWith(client, {
      isOnline: () => true,
      put: async () => {
        attempts += 1;
        if (attempts < 3) throw new XhrPutFailedError(0);
      },
    });

    manager.enqueue([local('nota.txt')]);
    await manager.idle();

    expect(attempts).toBe(3);
    expect(onlyRow(manager).phase).toBe('done');
  });

  it('CA-8: un 403 (URL vencida) vuelve a pedir resume y reintenta con la URL nueva', async () => {
    const client = new FakeClient();
    const puts: string[] = [];
    const manager = managerWith(client, {
      put: async (request) => {
        puts.push(request.url);
        if (puts.length === 1) throw new XhrPutFailedError(403);
      },
    });

    manager.enqueue([local('nota.txt')]);
    await manager.idle();

    expect(client.resumes).toEqual([SIMPLE_ID]);
    expect(puts).toEqual([`https://minio.local/${SIMPLE_ID}`, 'https://minio.local/resumed']);
    expect(onlyRow(manager).phase).toBe('done');
  });

  it('CA-8: un 403 en una parte renueva solo la URL de esa parte', async () => {
    const client = new FakeClient();
    client.initResult = async (body) => multipartResponse(body.name, 2, 2);
    client.resumeResult = partsResumed;
    const puts: string[] = [];
    const manager = managerWith(client, {
      put: async (request) => {
        puts.push(request.url);
        if (request.url.endsWith('part-2')) throw new XhrPutFailedError(403);
      },
    });

    manager.enqueue([local('grande.bin', 4)]);
    await manager.idle();

    expect(puts).toEqual([
      'https://minio.local/part-1',
      'https://minio.local/part-2',
      'https://minio.local/only-2',
    ]);
    expect(onlyRow(manager).phase).toBe('done');
  });

  it('CA-8: reintenta un PUT cinco veces con espera exponencial y jitter; luego rechaza y libera la reserva', async () => {
    const client = new FakeClient();
    const waits: number[] = [];
    let attempts = 0;
    const manager = managerWith(client, {
      put: async () => {
        attempts += 1;
        throw new XhrPutFailedError(500);
      },
      sleep: async (milliseconds) => {
        waits.push(milliseconds);
      },
      random: () => 0.5,
    });

    manager.enqueue([local('nota.txt')]);
    await manager.idle();

    expect(attempts).toBe(5);
    expect(waits).toEqual([220, 440, 880, 1760]);
    expect(onlyRow(manager)).toMatchObject({ phase: 'rejected', errorCode: null });
    expect(client.completes).toEqual([]);
    expect(client.cancels).toEqual([SIMPLE_ID]);
  });

  it('CA-8: un corte en una parte detiene las demás partes de ese archivo', async () => {
    const client = new FakeClient();
    client.initResult = async (body) => multipartResponse(body.name, 2, 2);
    const aborted: string[] = [];
    const manager = managerWith(client, {
      isOnline: () => false,
      put: (request) => {
        if (request.url.endsWith('part-1')) return Promise.reject(new XhrPutFailedError(0));
        return new Promise((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => {
            aborted.push(request.url);
            reject(abortError());
          });
        });
      },
    });

    manager.enqueue([local('grande.bin', 4)]);
    await manager.idle();

    expect(onlyRow(manager).phase).toBe('offline');
    expect(aborted).toEqual(['https://minio.local/part-2']);
  });

  it('CA-8: si se corta durante complete, al volver la red repite complete sin volver a subir', async () => {
    const client = new FakeClient();
    let completes = 0;
    client.completeResult = async () => {
      completes += 1;
      if (completes === 1) throw new TypeError('Failed to fetch');
      return { file: fileSummary('nota.txt', 3) };
    };
    const puts: string[] = [];
    const manager = managerWith(client, {
      put: async (request) => {
        puts.push(request.url);
      },
    });

    manager.enqueue([local('nota.txt')]);
    await manager.idle();
    expect(onlyRow(manager).phase).toBe('offline');

    manager.networkOnline();
    await manager.idle();

    expect(client.resumes).toEqual([]);
    expect(puts).toHaveLength(1);
    expect(client.completes).toEqual([SIMPLE_ID, SIMPLE_ID]);
    expect(onlyRow(manager).phase).toBe('done');
  });

  it('CA-22: con 0 % cancela directo, sin pedir confirmación', async () => {
    const client = new FakeClient();
    const manager = managerWith(client, { put: hangingPut().put });

    manager.enqueue([local('nota.txt')]);
    await flush();
    manager.requestCancel(onlyRow(manager).id);
    await manager.idle();

    expect(onlyRow(manager)).toMatchObject({ phase: 'cancelled', awaitingCancel: false });
    expect(client.cancels).toEqual([SIMPLE_ID]);
  });

  it('CA-22: con progreso pausa y espera; «Cancelar carga» cancela en el servidor', async () => {
    const client = new FakeClient();
    const hanging = hangingPut();
    const manager = managerWith(client, {
      put: (request) => {
        request.onProgress({ loadedBytes: 1, totalBytes: 3 });
        return hanging.put(request);
      },
    });

    manager.enqueue([local('nota.txt')]);
    await flush();
    manager.requestCancel(onlyRow(manager).id);

    expect(onlyRow(manager)).toMatchObject({ phase: 'paused', awaitingCancel: true });
    expect(client.cancels).toEqual([]);

    manager.confirmCancel(onlyRow(manager).id);
    await manager.idle();
    expect(onlyRow(manager)).toMatchObject({ phase: 'cancelled', awaitingCancel: false });
    expect(client.cancels).toEqual([SIMPLE_ID]);
  });

  it('CA-22: «Seguir subiendo» reanuda la carga que iba en curso', async () => {
    const client = new FakeClient();
    const hanging = hangingPut();
    let first = true;
    const manager = managerWith(client, {
      put: (request) => {
        request.onProgress({ loadedBytes: 1, totalBytes: 3 });
        if (!first) return Promise.resolve();
        first = false;
        return hanging.put(request);
      },
    });

    manager.enqueue([local('nota.txt')]);
    await flush();
    manager.requestCancel(onlyRow(manager).id);
    manager.dismissCancel(onlyRow(manager).id);
    await manager.idle();

    expect(client.resumes).toEqual([SIMPLE_ID]);
    expect(onlyRow(manager)).toMatchObject({ phase: 'done', awaitingCancel: false });
    expect(client.cancels).toEqual([]);
  });

  it('CA-22: si ya estaba en pausa, «Seguir subiendo» la deja en pausa', async () => {
    const client = new FakeClient();
    const hanging = hangingPut();
    const manager = managerWith(client, {
      put: (request) => {
        request.onProgress({ loadedBytes: 1, totalBytes: 3 });
        return hanging.put(request);
      },
    });

    manager.enqueue([local('nota.txt')]);
    await flush();
    manager.pause(onlyRow(manager).id);
    manager.requestCancel(onlyRow(manager).id);
    expect(onlyRow(manager).awaitingCancel).toBe(true);
    manager.dismissCancel(onlyRow(manager).id);

    expect(onlyRow(manager)).toMatchObject({ phase: 'paused', awaitingCancel: false });
    expect(client.resumes).toEqual([]);
  });

  it('CA-22: cancelar mientras se inicia cancela también la sesión que llega después', async () => {
    const client = new FakeClient();
    let answer = (): void => undefined;
    client.initResult = (body) =>
      new Promise((resolve) => {
        answer = () => resolve(simpleResponse(body.name));
      });
    const manager = managerWith(client);

    manager.enqueue([local('nota.txt')]);
    manager.requestCancel(onlyRow(manager).id);
    answer();
    await manager.idle();

    expect(onlyRow(manager).phase).toBe('cancelled');
    expect(client.cancels).toEqual([SIMPLE_ID]);
  });

  it('CA-22: una carga rechazada no se puede cancelar', async () => {
    const client = new FakeClient();
    client.initResult = async () => {
      throw new StorageRequestError(422, 'STORAGE_EMPTY_FILE');
    };
    const manager = managerWith(client);

    manager.enqueue([local('vacio.txt', 0)]);
    await manager.idle();
    manager.requestCancel(onlyRow(manager).id);

    expect(onlyRow(manager).phase).toBe('rejected');
    expect(client.cancels).toEqual([]);
  });

  it('CA-19: un 429 deja la fila en espera y «Reintentar» vuelve a iniciar', async () => {
    const client = new FakeClient();
    let calls = 0;
    client.initResult = async (body) => {
      calls += 1;
      if (calls === 1) throw new StorageRequestError(429, 'STORAGE_TOO_MANY_REQUESTS');
      return simpleResponse(body.name);
    };
    const manager = managerWith(client);

    manager.enqueue([local('nota.txt')]);
    await manager.idle();
    expect(onlyRow(manager)).toMatchObject({
      phase: 'rate_limited',
      errorCode: 'STORAGE_TOO_MANY_REQUESTS',
    });

    manager.retry(onlyRow(manager).id);
    await manager.idle();
    expect(onlyRow(manager)).toMatchObject({ phase: 'done', errorCode: null });
  });

  it('CA-9: un 410 al reanudar marca la carga como caducada', async () => {
    const client = new FakeClient();
    client.resumeResult = async () => {
      throw new StorageRequestError(410, 'STORAGE_UPLOAD_EXPIRED');
    };
    const manager = managerWith(client, { put: hangingPut().put });

    manager.enqueue([local('nota.txt')]);
    await flush();
    manager.pause(onlyRow(manager).id);
    manager.resume(onlyRow(manager).id);
    await manager.idle();

    expect(onlyRow(manager)).toMatchObject({
      phase: 'expired',
      errorCode: 'STORAGE_UPLOAD_EXPIRED',
    });
  });
});
