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

/**
 * `IDocumentEditor` sobre ONLYOFFICE Docs (ADR-0004). Firma la configuración del editor con el JWT compartido
 * (`ONLYOFFICE_JWT_SECRET`, `@nestjs/jwt`) y comprueba la salud en la URL interna. Sin conexión configurada nunca está
 * disponible y no firma nada. Nunca registra la configuración ni el token.
 */
export class OnlyOfficeEditor implements IDocumentEditor {
  constructor(
    private readonly jwt: JwtService,
    private readonly connection: OnlyOfficeConnection | null,
  ) {}

  signConfig(config: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    if (this.connection === null) throw new Error('ONLYOFFICE no está configurado.');
    const token = this.jwt.sign(
      { ...config },
      {
        secret: this.connection.jwtSecret,
        algorithm: ALGORITHM,
      },
    );
    return { ...config, token };
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
}
