/** Datos del cliente que acompañan un inicio de sesión. El secreto de dispositivo es opcional. */
export interface ClientContext {
  readonly deviceSecret?: string;
  readonly userAgent: string;
  readonly ip: string | null;
}
