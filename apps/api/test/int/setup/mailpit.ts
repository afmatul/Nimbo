import { MAILPIT_API_URL_VAR } from './containers';

/** Dirección tal como la devuelve la API de Mailpit. */
export interface MailpitAddress {
  readonly Name: string;
  readonly Address: string;
}

/** Resumen de un mensaje en `GET /api/v1/messages`. */
export interface MailpitSummary {
  readonly ID: string;
  readonly MessageID: string;
  readonly From: MailpitAddress;
  readonly To: readonly MailpitAddress[];
  readonly Subject: string;
}

/** Adjunto tal como lo describe `GET /api/v1/message/{ID}`. */
export interface MailpitAttachment {
  readonly FileName: string;
  readonly ContentType: string;
  readonly Size: number;
}

/** Mensaje completo de `GET /api/v1/message/{ID}`. */
export interface MailpitMessage extends MailpitSummary {
  readonly Text: string;
  readonly HTML: string;
  readonly Attachments: readonly MailpitAttachment[];
}

const WAIT_STEP_MS = 100;
const DEFAULT_WAIT_MS = 10_000;

/** URL de la API del Mailpit del arnés (`globalSetup`) o la que reciba la suite que levantó el suyo. */
const apiUrl = (baseUrl?: string): string => {
  const url = baseUrl ?? process.env[MAILPIT_API_URL_VAR];
  if (url === undefined) throw new Error(`Falta ${MAILPIT_API_URL_VAR}: ¿corrió el globalSetup?`);
  return url;
};

const request = async (path: string, init: RequestInit, baseUrl?: string): Promise<Response> => {
  const response = await fetch(`${apiUrl(baseUrl)}${path}`, init);
  if (!response.ok) throw new Error(`Mailpit respondió ${String(response.status)} en ${path}`);
  return response;
};

export const listMessages = async (baseUrl?: string): Promise<MailpitSummary[]> => {
  const response = await request('/api/v1/messages', { method: 'GET' }, baseUrl);
  const body = (await response.json()) as { messages: MailpitSummary[] };
  return body.messages;
};

export const getMessage = async (id: string, baseUrl?: string): Promise<MailpitMessage> => {
  const response = await request(`/api/v1/message/${id}`, { method: 'GET' }, baseUrl);
  return (await response.json()) as MailpitMessage;
};

export const deleteAll = async (baseUrl?: string): Promise<void> => {
  await request('/api/v1/messages', { method: 'DELETE' }, baseUrl);
};

/** Espera hasta que la bandeja tenga al menos `count` mensajes; lanza si no llegan en `timeoutMs`. */
export const waitForMessages = async (
  count: number,
  options: { readonly timeoutMs?: number; readonly baseUrl?: string } = {},
): Promise<MailpitSummary[]> => {
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_WAIT_MS);
  for (;;) {
    const messages = await listMessages(options.baseUrl);
    if (messages.length >= count) return messages;
    if (Date.now() >= deadline) {
      throw new Error(
        `Mailpit tiene ${String(messages.length)} mensajes; se esperaban ${String(count)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
  }
};
