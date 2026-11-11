import {
  connectOoxmlWorker,
  type OoxmlWorkerOptions,
  type OoxmlWorkerReading,
} from './ooxml-worker-client';

/** Worker OOXML local, empaquetado por el bundler junto con zip.js y saxes; sin CDN. */
export function startOoxmlWorker(options: OoxmlWorkerOptions): OoxmlWorkerReading {
  const worker = new Worker(new URL('../workers/ooxml.worker.ts', import.meta.url), {
    type: 'module',
  });
  return connectOoxmlWorker(worker, options);
}
