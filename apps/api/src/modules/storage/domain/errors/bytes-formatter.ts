/**
 * Formatea un tamaño para los mensajes (p. ej. «52,4 MB»). La aplicación inyecta `formatBytes` de `contracts`, la
 * misma función que usa `web`; el dominio no importa ese paquete (ADR-0008).
 */
export type BytesFormatter = (bytes: number) => string;
