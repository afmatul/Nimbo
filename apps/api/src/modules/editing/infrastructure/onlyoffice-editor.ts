import type { JwtService } from '@nestjs/jwt';

import type { OnlyOfficeConnection } from '../application/editing-config';
import type { IDocumentEditor } from '../application/ports/i-document-editor.port';

/** Algoritmo fijo para firmar lo que recibe ONLYOFFICE (plan §5). */
const ALGORITHM = 'HS256';
/** ONLYOFFICE responde `true` en `/healthcheck` cuando acepta documentos. */
const HEALTHCHECK_PATH = '/healthcheck';
const HEALTHY_BODY = 'true';
/** Abrir no espera más que esto a un ONLYOFFICE caído (CA-15). */
const HEALTHCHECK_TIMEOUT_MS = 2_000;
/** Servicio de comandos de ONLYOFFICE: `drop` desconecta cuentas de un documento abierto (CA-16). */
const COMMAND_PATH = '/command';
const COMMAND_TIMEOUT_MS = 5_000;
/** `error: 0` es el único acuse de éxito del servicio de comandos. */
const COMMAND_OK = 0;

/**
 * `IDocumentEditor` sobre ONLYOFFICE Docs (ADR-0004). Firma la configuración del editor con el JWT compartido
 * (`ONLYOFFICE_JWT_SECRET`, `@nestjs/jwt`), comprueba la salud y manda comandos firmados a la URL interna. Sin
 * conexión configurada nunca está disponible y no firma nada. Nunca registra la configuración ni el token.
 */
export class OnlyOfficeEditor implements IDocumentEditor {
  constructor(
    private readonly jwt: JwtService,
    private readonly connection: OnlyOfficeConnection | null,
  ) {}

  signConfig(config: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    if (this.connection === null) throw new Error('ONLYOFFICE no está configurado.');
    return { ...config, token: this.sign(this.connection, config) };
  }

  async isAvailable(): Promise<boolean> {
    if (this.connection === null) return false;
    try {
      const response = await fetch(`${this.connection.internalUrl}${HEALTHCHECK_PATH}`, {
        signal: AbortSignal.timeout(HEALTHCHECK_TIMEOUT_MS),
        redirect: 'error',
      });
      return response.ok && (await response.text()).trim() === HEALTHY_BODY;
    } catch {
      return false;
    }
  }

  async dropUser(documentKey: string, userId: string): Promise<boolean> {
    if (this.connection === null) return false;
    const command = { c: 'drop', key: documentKey, users: [userId] };
    try {
      const response = await fetch(`${this.connection.internalUrl}${COMMAND_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: this.sign(this.connection, command) }),
        signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
        redirect: 'error',
      });
      return response.ok && ((await response.json()) as { error?: unknown }).error === COMMAND_OK;
    } catch {
      return false;
    }
  }

  private sign(
    connection: OnlyOfficeConnection,
    payload: Readonly<Record<string, unknown>>,
  ): string {
    return this.jwt.sign({ ...payload }, { secret: connection.jwtSecret, algorithm: ALGORITHM });
  }
}
