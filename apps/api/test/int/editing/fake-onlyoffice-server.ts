import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

const FILES_PATH = '/cache/files/';
const REDIRECT_PATH = '/redirect/';

const UNAVAILABLE_STATUS = 503;

/**
 * Un documento servido: sus bytes, si la prueba lo pide una espera hasta que lo libere, y cuántas descargas más
 * responden 503 antes de servirlo (fallo transitorio, CA-14).
 */
interface ServedFile {
  readonly bytes: Buffer;
  readonly gate: Promise<void> | null;
  failuresLeft: number;
}

/** Una descarga «retenida»: la prueba la libera cuando ya comprobó que la petición del aviso terminó antes. */
export interface HeldDownload {
  readonly url: string;
  release(): void;
}

/**
 * Doble HTTP de ONLYOFFICE Docs para las suites de guardado (016 T-05): el `api` usa el `OnlyOfficeEditor` real (JWT,
 * lista blanca por origen, descarga por flujo) contra este servidor en `127.0.0.1`. Responde la salud, acepta comandos
 * (`drop`) y sirve los documentos que la prueba registra, contando cada descarga.
 */
export class FakeOnlyOfficeServer {
  readonly downloads: string[] = [];
  readonly commands: string[] = [];
  private readonly files = new Map<string, ServedFile>();
  private readonly server: Server;

  private constructor() {
    this.server = createServer((request, response) => {
      void this.route(request, response);
    });
  }

  static async start(): Promise<FakeOnlyOfficeServer> {
    const fake = new FakeOnlyOfficeServer();
    await new Promise<void>((resolve) => fake.server.listen(0, '127.0.0.1', resolve));
    return fake;
  }

  get origin(): string {
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${String(port)}`;
  }

  /** URL de descarga de `bytes`, como la que trae el aviso de estado 2. */
  serve(bytes: Buffer): string {
    const name = randomUUID();
    this.files.set(name, { bytes, gate: null, failuresLeft: 0 });
    return `${this.origin}${FILES_PATH}${name}`;
  }

  /** Como `serve`, pero las primeras `failures` descargas responden 503 (el servidor de documentos no responde). */
  serveAfterFailures(bytes: Buffer, failures: number): string {
    const name = randomUUID();
    this.files.set(name, { bytes, gate: null, failuresLeft: failures });
    return `${this.origin}${FILES_PATH}${name}`;
  }

  /** Como `serve`, pero la respuesta espera a `release()`. */
  hold(bytes: Buffer): HeldDownload {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const name = randomUUID();
    this.files.set(name, { bytes, gate, failuresLeft: 0 });
    return { url: `${this.origin}${FILES_PATH}${name}`, release: () => release() };
  }

  /** URL de este servidor que redirige a `target` (CA-19: no se sigue). */
  redirectTo(target: string): string {
    return `${this.origin}${REDIRECT_PATH}?to=${encodeURIComponent(target)}`;
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  private async route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', this.origin);
    if (url.pathname === '/healthcheck') return void response.end('true');
    if (url.pathname === '/command') return this.command(request, response);
    if (url.pathname.startsWith(REDIRECT_PATH)) {
      response.writeHead(302, { location: url.searchParams.get('to') ?? '/' });
      return void response.end();
    }
    if (url.pathname.startsWith(FILES_PATH)) return this.download(url.pathname, response);
    response.writeHead(404);
    response.end();
  }

  private async command(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    this.commands.push(Buffer.concat(chunks).toString('utf8'));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 0 }));
  }

  private async download(pathname: string, response: ServerResponse): Promise<void> {
    const file = this.files.get(pathname.slice(FILES_PATH.length));
    this.downloads.push(pathname);
    if (file === undefined) {
      response.writeHead(404);
      return void response.end();
    }
    if (file.failuresLeft > 0) {
      file.failuresLeft -= 1;
      response.writeHead(UNAVAILABLE_STATUS);
      return void response.end();
    }
    if (file.gate !== null) await file.gate;
    response.writeHead(200, { 'content-length': String(file.bytes.length) });
    response.end(file.bytes);
  }
}
