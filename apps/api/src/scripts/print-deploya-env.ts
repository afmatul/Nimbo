import { resolveDeployaEnv, toShellExports } from './deploya-env';

/**
 * Lo llama `deploya-entrypoint.sh` (`node dist/scripts/print-deploya-env.js`): imprime en stdout las líneas
 * `export` para `eval` y en stderr una línea `deploya.env` con los **nombres** definidos y los avisos, nunca valores.
 */
const result = resolveDeployaEnv(process.env);
process.stdout.write(toShellExports(result.values));
process.stderr.write(
  `${JSON.stringify({ event: 'deploya.env', defined: Object.keys(result.values), warnings: result.warnings })}\n`,
);
