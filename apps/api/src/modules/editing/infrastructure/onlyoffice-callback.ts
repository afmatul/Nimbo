import type { EditorSignal, EditorSignalKind } from '../application/ports/i-document-editor.port';

/** Estados del aviso de ONLYOFFICE (`callbackUrl`) que Nimbo distingue; el resto se ignora (RN-4). */
const SIGNAL_BY_STATUS: Readonly<Record<number, EditorSignalKind>> = {
  1: 'editing',
  2: 'ready',
  3: 'failed',
  4: 'closed',
};

/** Cuerpo del aviso tal como viene en el payload del JWT. */
interface CallbackClaims {
  readonly key?: unknown;
  readonly status?: unknown;
  readonly url?: unknown;
  readonly users?: unknown;
  readonly payload?: unknown;
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** En la cabecera `Authorization` el aviso viaja dentro de `payload`; en el cuerpo, tal cual. */
const bodyOf = (claims: CallbackClaims): CallbackClaims =>
  typeof claims.payload === 'object' && claims.payload !== null
    ? (claims.payload as CallbackClaims)
    : claims;

/** La señal de un aviso ya verificado; `null` si le falta la clave o el estado, o trae usuarios mal formados. */
export const signalOf = (claims: CallbackClaims): EditorSignal | null => {
  const body = bodyOf(claims);
  const users = body.users ?? [];
  if (typeof body.key !== 'string' || body.key === '') return null;
  if (typeof body.status !== 'number' || !isStringArray(users)) return null;
  return {
    documentKey: body.key,
    kind: SIGNAL_BY_STATUS[body.status] ?? 'ignored',
    users,
    downloadUrl: typeof body.url === 'string' ? body.url : null,
  };
};
