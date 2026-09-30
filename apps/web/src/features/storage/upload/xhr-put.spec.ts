import { putObject, XhrPutFailedError, type XhrLike } from './xhr-put';

class FakeXhr implements XhrLike {
  method = '';
  url = '';
  body: Blob | ArrayBuffer | null = null;
  readonly headers: Record<string, string> = {};
  status = 200;
  withCredentials = true;
  aborted = false;
  sendCount = 0;
  upload: XhrLike['upload'] = { onprogress: null };
  onload: XhrLike['onload'] = null;
  onerror: XhrLike['onerror'] = null;
  onabort: XhrLike['onabort'] = null;

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(body: Blob | ArrayBuffer | null): void {
    this.body = body;
    this.sendCount += 1;
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }

  emitProgress(loaded: number, total: number): void {
    this.upload.onprogress?.({ loaded, total, lengthComputable: true });
  }

  succeed(): void {
    this.status = 200;
    this.onload?.();
  }

  failStatus(status: number): void {
    this.status = status;
    this.onload?.();
  }

  failNetwork(): void {
    this.onerror?.();
  }
}

const url = 'http://localhost:9000/nimbo/u/a/b/c?X-Amz-Signature=abc';

describe('putObject', () => {
  it('CA-21: informa los bytes enviados y no manda credenciales de la app', async () => {
    const xhr = new FakeXhr();
    const progress: Array<{ loadedBytes: number; totalBytes: number }> = [];
    const pending = putObject(
      {
        url,
        body: new Uint8Array([1, 2, 3]),
        onProgress: (value) => {
          progress.push(value);
        },
      },
      () => xhr,
    );

    xhr.emitProgress(1, 3);
    xhr.emitProgress(3, 3);
    xhr.succeed();
    await pending;

    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe(url);
    expect(xhr.sendCount).toBe(1);
    expect(xhr.headers).toEqual({});
    expect(xhr.withCredentials).toBe(false);
    expect(progress).toEqual([
      { loadedBytes: 1, totalBytes: 3 },
      { loadedBytes: 3, totalBytes: 3 },
    ]);
  });

  it('CA-21: abortar rechaza la promesa y no reintenta', async () => {
    const xhr = new FakeXhr();
    const controller = new AbortController();
    const pending = putObject(
      { url, body: new Uint8Array([1]), signal: controller.signal, onProgress: () => undefined },
      () => xhr,
    );

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(xhr.aborted).toBe(true);
    expect(xhr.sendCount).toBe(1);
  });

  it('CA-21: un fallo de red rechaza sin reintentar', async () => {
    const xhr = new FakeXhr();
    const pending = putObject(
      { url, body: new Uint8Array([1]), onProgress: () => undefined },
      () => xhr,
    );

    xhr.failNetwork();

    await expect(pending).rejects.toBeInstanceOf(XhrPutFailedError);
    expect(xhr.sendCount).toBe(1);
  });

  it('CA-21: un estado HTTP distinto de 2xx rechaza sin reintentar', async () => {
    const xhr = new FakeXhr();
    const pending = putObject(
      { url, body: new Uint8Array([1]), onProgress: () => undefined },
      () => xhr,
    );

    xhr.failStatus(403);
    await expect(pending).rejects.toMatchObject({ status: 403 });
    expect(xhr.sendCount).toBe(1);
  });
});
