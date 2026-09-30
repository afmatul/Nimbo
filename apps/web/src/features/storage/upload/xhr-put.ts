export interface UploadByteProgress {
  readonly loadedBytes: number;
  readonly totalBytes: number;
}

export interface XhrLike {
  upload: {
    onprogress:
      | ((event: {
          readonly loaded: number;
          readonly total: number;
          readonly lengthComputable: boolean;
        }) => void)
      | null;
  };
  status: number;
  withCredentials: boolean;
  open(method: string, url: string): void;
  send(body: Blob | ArrayBuffer | Uint8Array | null): void;
  abort(): void;
  setRequestHeader(name: string, value: string): void;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
}

export interface PutObjectRequest {
  readonly url: string;
  readonly body: Blob | ArrayBuffer | Uint8Array;
  readonly onProgress: (progress: UploadByteProgress) => void;
  readonly signal?: AbortSignal;
}

export class XhrPutFailedError extends Error {
  constructor(readonly status: number) {
    super('No se pudo enviar el archivo. Revisa tu conexión e inténtalo de nuevo.');
    this.name = 'XhrPutFailedError';
  }
}

function abortError(): Error {
  const error = new Error('La carga se detuvo.');
  error.name = 'AbortError';
  return error;
}

function createBrowserXhr(): XhrLike {
  const xhr = new XMLHttpRequest();
  const upload: XhrLike['upload'] = { onprogress: null };
  let onload: XhrLike['onload'] = null;
  let onerror: XhrLike['onerror'] = null;
  let onabort: XhrLike['onabort'] = null;
  xhr.upload.onprogress = (event) => {
    upload.onprogress?.({
      loaded: event.loaded,
      total: event.total,
      lengthComputable: event.lengthComputable,
    });
  };
  xhr.onload = () => {
    onload?.();
  };
  xhr.onerror = () => {
    onerror?.();
  };
  xhr.onabort = () => {
    onabort?.();
  };
  return {
    upload,
    get status() {
      return xhr.status;
    },
    get withCredentials() {
      return xhr.withCredentials;
    },
    set withCredentials(value) {
      xhr.withCredentials = value;
    },
    open: (method, url) => {
      xhr.open(method, url);
    },
    send: (body) => {
      xhr.send(body as XMLHttpRequestBodyInit | null);
    },
    abort: () => {
      xhr.abort();
    },
    setRequestHeader: (name, value) => {
      xhr.setRequestHeader(name, value);
    },
    set onload(handler) {
      onload = handler;
    },
    get onload() {
      return onload;
    },
    set onerror(handler) {
      onerror = handler;
    },
    get onerror() {
      return onerror;
    },
    set onabort(handler) {
      onabort = handler;
    },
    get onabort() {
      return onabort;
    },
  };
}

/**
 * PUT directo al almacenamiento de objetos. El reintento vive en el manager.
 * No añade Authorization ni ninguna otra cabecera: la URL prefirmada ya trae lo que MinIO firmó.
 */
export function putObject(
  request: PutObjectRequest,
  createXhr: () => XhrLike = createBrowserXhr,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (request.signal?.aborted) {
      reject(abortError());
      return;
    }

    const xhr = createXhr();
    const onAbort = (): void => {
      xhr.abort();
    };

    xhr.open('PUT', request.url);
    xhr.withCredentials = false;
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }
      request.onProgress({ loadedBytes: event.loaded, totalBytes: event.total });
    };
    xhr.onload = () => {
      request.signal?.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new XhrPutFailedError(xhr.status));
    };
    xhr.onerror = () => {
      request.signal?.removeEventListener('abort', onAbort);
      reject(new XhrPutFailedError(0));
    };
    xhr.onabort = () => {
      request.signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    request.signal?.addEventListener('abort', onAbort);
    xhr.send(request.body);
  });
}
