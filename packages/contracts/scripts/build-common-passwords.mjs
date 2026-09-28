// Genera `src/identity/common-passwords.ts` desde el top 100 000 de SecLists (plan 001 §6.2).
// Uso: `pnpm --filter @nimbo/contracts build:common-passwords [ruta-local.txt]`.
// Sin ruta, descarga la lista de la revisión fijada en SOURCE_URL.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECLISTS_REVISION = 'c205c36a445bff37f8e58a9ec829105cd4975c58';
const SOURCE_PATH = 'Passwords/Common-Credentials/xato-net-10-million-passwords-100000.txt';
const SOURCE_URL = `https://raw.githubusercontent.com/danielmiessler/SecLists/${SECLISTS_REVISION}/${SOURCE_PATH}`;
const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), '../src/identity/common-passwords.ts');

// Mismas reglas que `evaluatePassword` (D-6), sin la de mayúscula: la comparación es insensible a mayúsculas.
const MIN_LENGTH = 12;
const MAX_LENGTH = 128;
const NUMBER = /\p{Nd}/u;
const SYMBOL = /[^\p{L}\p{N}\s]/u;

async function readSource(localPath) {
  if (localPath) {
    return readFile(localPath, 'utf8');
  }
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(
      `No se pudo descargar la lista (${response.status}). Pasa una ruta local como argumento.`,
    );
  }
  return response.text();
}

function wouldPassOtherRules(candidate) {
  const length = [...candidate].length;
  return (
    length >= MIN_LENGTH && length <= MAX_LENGTH && NUMBER.test(candidate) && SYMBOL.test(candidate)
  );
}

function filterCommon(text) {
  const entries = text.split(/\r?\n/).map((line) => line.toLowerCase());
  return [...new Set(entries.filter(wouldPassOtherRules))];
}

// Comillas como las elige Prettier: simples salvo que la cadena contenga una simple y ninguna doble.
function quote(value) {
  const escaped = value.replaceAll('\\', '\\\\');
  if (value.includes("'") && !value.includes('"')) {
    return `"${escaped}"`;
  }
  return `'${escaped.replaceAll("'", "\\'")}'`;
}

function render(entries) {
  return `// Archivo generado por \`scripts/build-common-passwords.mjs\`. No lo edites a mano.
//
// Fuente: SecLists, ${SOURCE_PATH} (revisión ${SECLISTS_REVISION}).
// SecLists: Copyright (c) 2018 Daniel Miessler. Licencia MIT:
// https://github.com/danielmiessler/SecLists/blob/master/LICENSE
//
// Solo entradas que pasarían las demás reglas de la política sin la de mayúscula (plan 001 §6.2), en minúsculas.

/** Contraseñas comunes, en minúsculas, en el orden de frecuencia de la fuente. */
export const COMMON_PASSWORDS: readonly string[] = [
${entries.map((entry) => `  ${quote(entry)},`).join('\n')}
];
`;
}

const entries = filterCommon(await readSource(process.argv[2]));
await writeFile(OUTPUT, render(entries), 'utf8');
process.stdout.write(`${entries.length} entradas escritas en ${OUTPUT}\n`);
