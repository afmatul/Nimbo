type ObjectByteRange = {
  readonly start: number;
  readonly end: number;
};

type ObjectBytesRequest = {
  readonly url: string;
  readonly signal: AbortSignal;
  readonly range?: ObjectByteRange;
};

export type ObjectBytes = {
  readonly body: ReadableStream<Uint8Array>;
  readonly totalLength?: number;
};

type ResponseLengths = {
  readonly expectedLength: number | undefined;
  readonly totalLength?: number;
};

type BodySource = ObjectBytes & {
  readonly signal: AbortSignal;
  readonly expectedLength: number | undefined;
};

type BodyReading = {
  readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  readonly controller: ReadableStreamDefaultController<Uint8Array>;
  readonly signal: AbortSignal;
  readonly expectedLength: number | undefined;
  readonly onAbort: () => void;
  bytesRead: number;
  finished: boolean;
  cleanup?: Promise<void>;
};

const FAILURE_MESSAGE = 'No se pudo leer el archivo para la vista previa.';

function isValidRange(range: ObjectByteRange): boolean {
  return (
    Number.isSafeInteger(range.start) &&
    Number.isSafeInteger(range.end) &&
    range.start >= 0 &&
    range.start <= range.end
  );
}

function rangeLengths(header: string | null, range: ObjectByteRange): ResponseLengths {
  if (header === null) throw new Error(FAILURE_MESSAGE);
  const match = /^bytes ([0-9]+)-([0-9]+)\/([0-9]+)$/.exec(header);
  if (match === null || match[0] !== header) throw new Error(FAILURE_MESSAGE);
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (
    !isValidRange({ start, end }) ||
    !Number.isSafeInteger(total) ||
    total <= end ||
    start !== range.start ||
    end !== Math.min(range.end, total - 1)
  )
    throw new Error(FAILURE_MESSAGE);
  return { expectedLength: end - start + 1, totalLength: total };
}

function responseLengths(response: Response, range: ObjectByteRange | undefined): ResponseLengths {
  if (response.status !== (range === undefined ? 200 : 206)) throw new Error(FAILURE_MESSAGE);
  if (range === undefined) return { expectedLength: undefined };
  const lengths = rangeLengths(response.headers.get('Content-Range'), range);
  const header = response.headers.get('Content-Length');
  if (header !== null) {
    const value = Number(header);
    const digits = /^[0-9]+$/.exec(header);
    if (
      digits === null ||
      digits[0] !== header ||
      !Number.isSafeInteger(value) ||
      value !== lengths.expectedLength
    )
      throw new Error(FAILURE_MESSAGE);
  }
  return lengths;
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Un body ya bloqueado o fallido no debe sustituir el error público saneado.
  }
}

async function releaseReader(reader: BodyReading['reader'], cancel: boolean): Promise<void> {
  try {
    if (cancel) await reader.cancel();
  } catch {
    // Una cancelación puede rechazar con el error privado que originó el fallo del body.
  } finally {
    reader.releaseLock();
  }
}

function finishReading(reading: BodyReading, cancel: boolean): Promise<void> {
  if (reading.finished) return reading.cleanup ?? Promise.resolve();
  reading.finished = true;
  reading.signal.removeEventListener('abort', reading.onAbort);
  reading.cleanup = releaseReader(reading.reader, cancel);
  return reading.cleanup;
}

function failReading(reading: BodyReading): void {
  if (reading.finished) return;
  reading.controller.error(new Error(FAILURE_MESSAGE));
  void finishReading(reading, true);
}

function beginReading(
  source: BodySource,
  controller: ReadableStreamDefaultController<Uint8Array>,
): BodyReading {
  const reading: BodyReading = {
    reader: source.body.getReader(),
    controller,
    signal: source.signal,
    expectedLength: source.expectedLength,
    onAbort: () => failReading(reading),
    bytesRead: 0,
    finished: false,
  };
  source.signal.addEventListener('abort', reading.onAbort, { once: true });
  if (source.signal.aborted) failReading(reading);
  return reading;
}

async function pullReading(reading: BodyReading): Promise<void> {
  if (reading.finished) return;
  try {
    const chunk = await reading.reader.read();
    if (reading.finished) return;
    if (reading.signal.aborted) throw new Error(FAILURE_MESSAGE);
    if (chunk.done) {
      if (reading.expectedLength !== undefined && reading.bytesRead !== reading.expectedLength)
        throw new Error(FAILURE_MESSAGE);
      reading.controller.close();
      await finishReading(reading, false);
      return;
    }
    reading.bytesRead += chunk.value.byteLength;
    if (reading.expectedLength !== undefined && reading.bytesRead > reading.expectedLength)
      throw new Error(FAILURE_MESSAGE);
    reading.controller.enqueue(chunk.value);
  } catch {
    failReading(reading);
  }
}

function protectedBody(source: BodySource): ReadableStream<Uint8Array> {
  let reading: BodyReading;
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        reading = beginReading(source, controller);
      },
      pull() {
        return pullReading(reading);
      },
      cancel() {
        return finishReading(reading, true);
      },
    },
    { highWaterMark: 0 },
  );
}

export async function fetchObjectBytes({
  url,
  signal,
  range,
}: ObjectBytesRequest): Promise<ObjectBytes> {
  let response: Response | undefined;
  try {
    if (signal.aborted || (range !== undefined && !isValidRange(range)))
      throw new Error(FAILURE_MESSAGE);
    response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      signal,
      ...(range === undefined ? {} : { headers: { Range: `bytes=${range.start}-${range.end}` } }),
    });
    const { expectedLength, totalLength } = responseLengths(response, range);
    const body = response.body;
    if (signal.aborted || body === null || response.bodyUsed || body.locked)
      throw new Error(FAILURE_MESSAGE);
    return {
      body: protectedBody({ body, signal, expectedLength }),
      ...(totalLength === undefined ? {} : { totalLength }),
    };
  } catch {
    if (response !== undefined) await discardBody(response);
    throw new Error(FAILURE_MESSAGE);
  }
}
