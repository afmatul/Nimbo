#!/usr/bin/env node
// Marcador para scripts raíz que aún no tienen implementación (CA-4: `test:e2e`, `seed`).
// Imprime el motivo recibido como argumento y termina con código 0 para no romper CI ni el flujo local.
const reason = process.argv.slice(2).join(' ') || 'sin implementación todavía';
process.stdout.write(`[nimbo] marcador: ${reason}\n`);
process.exit(0);
