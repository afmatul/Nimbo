import { configure } from '../readers/zip-core';

import { serveOoxml, type WorkerScope } from './ooxml-session';

// Sin workers anidados: zip.js descomprime dentro de este mismo worker (ADR-0026).
configure({ useWebWorkers: false });
// El tsconfig web solo incluye la lib DOM; el ámbito real es DedicatedWorkerGlobalScope.
serveOoxml(self as unknown as WorkerScope);
