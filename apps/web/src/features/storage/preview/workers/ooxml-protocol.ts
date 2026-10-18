import type { OoxmlFailureReason } from '../readers/ooxml-package-reader';
import type { OoxmlKind } from '../readers/ooxml-relations';

/** Único mensaje hacia el worker: la URL firmada solo viaja en este sentido. */
export type OpenRequest = {
  readonly type: 'open';
  readonly session: number;
  readonly kind: OoxmlKind;
  readonly url: string;
};
/** Mensajes del worker: identificador de sesión y razón cerrada; nunca URL, Error, stack, XML ni bytes. */
export type WorkerMessage =
  | { readonly type: 'opened'; readonly session: number }
  | { readonly type: 'failure'; readonly session: number; readonly reason: OoxmlFailureReason };

const KINDS: readonly unknown[] = ['xlsx', 'pptx'];
const REASONS: readonly unknown[] = ['corrupt', 'protected', 'unavailable', 'memory'];

function record(data: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  const actual = Object.keys(data).sort();
  return actual.length === keys.length && [...keys].sort().every((key, i) => actual[i] === key)
    ? (data as Record<string, unknown>)
    : undefined;
}

function isSession(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function parseOpenRequest(data: unknown): OpenRequest | undefined {
  const value = record(data, ['type', 'session', 'kind', 'url']);
  if (value?.type !== 'open' || !isSession(value.session) || !KINDS.includes(value.kind))
    return undefined;
  return typeof value.url === 'string' && value.url !== ''
    ? { type: 'open', session: value.session, kind: value.kind as OoxmlKind, url: value.url }
    : undefined;
}

export function parseWorkerMessage(data: unknown): WorkerMessage | undefined {
  const opened = record(data, ['type', 'session']);
  if (opened?.type === 'opened' && isSession(opened.session))
    return { type: 'opened', session: opened.session };
  const failure = record(data, ['type', 'session', 'reason']);
  if (failure?.type !== 'failure' || !isSession(failure.session)) return undefined;
  return REASONS.includes(failure.reason)
    ? { type: 'failure', session: failure.session, reason: failure.reason as OoxmlFailureReason }
    : undefined;
}
