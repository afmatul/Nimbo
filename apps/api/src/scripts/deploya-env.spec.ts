import { execFileSync } from 'node:child_process';

import {
  appRoleStatements,
  appRoleUrl,
  isDeploya,
  quoteLiteral,
  resolveDeployaEnv,
  toShellExports,
} from './deploya-env';

const OWNER_URL = 'postgres://deploya:Secreto123@deploya-datos-nimbo-api-postgres:5432/app';

const deployaEnv = (extra: Record<string, string> = {}): Record<string, string> => ({
  DEPLOYA_POSTGRES_URL: OWNER_URL,
  DATABASE_URL: OWNER_URL,
  DEPLOYA_REDIS_URL: 'redis://deploya-datos-nimbo-api-redis:6379',
  REDIS_URL: 'redis://deploya-datos-nimbo-api-redis:6379',
  S3_ENDPOINT: 'http://deploya-datos-nimbo-api-s3:9000',
  S3_PUBLIC_ENDPOINT: 'https://nimbo-api-s3.deploya.larasolutions.dev',
  S3_ACCESS_KEY: 'deploya',
  S3_SECRET_KEY: 'clave-s3',
  S3_BUCKET: 'app',
  S3_REGION: 'us-east-1',
  NIMBO_APP_DB_PASSWORD: 'clave-app',
  ...extra,
});

describe('resolveDeployaEnv', () => {
  it('no define nada fuera de Deploya (staging y compose quedan igual)', () => {
    const env = {
      DATABASE_URL: 'postgres://nimbo_app:x@postgres:5432/nimbo',
      S3_ENDPOINT: 'http://otro:9000',
    };
    expect(isDeploya(env)).toBe(false);
    expect(resolveDeployaEnv(env)).toEqual({ values: {}, warnings: [] });
  });

  it('cambia la DATABASE_URL inyectada (dueño) por nimbo_app y deja al dueño para migrar', () => {
    const { values, warnings } = resolveDeployaEnv(deployaEnv());
    expect(values['DATABASE_URL']).toBe(
      'postgres://nimbo_app:clave-app@deploya-datos-nimbo-api-postgres:5432/app',
    );
    expect(values['DATABASE_MIGRATION_URL']).toBe(OWNER_URL);
    expect(warnings).toEqual([]);
  });

  it('respeta una DATABASE_URL del usuario que no conecta como el dueño', () => {
    const own = 'postgres://nimbo_app:propia@deploya-datos-nimbo-api-postgres:5432/app';
    const { values } = resolveDeployaEnv(
      deployaEnv({ DATABASE_URL: own, DATABASE_MIGRATION_URL: OWNER_URL }),
    );
    expect(values['DATABASE_URL']).toBeUndefined();
    expect(values['DATABASE_MIGRATION_URL']).toBeUndefined();
  });

  it('avisa, sin valores, si falta NIMBO_APP_DB_PASSWORD', () => {
    const { values, warnings } = resolveDeployaEnv(deployaEnv({ NIMBO_APP_DB_PASSWORD: '' }));
    expect(values['DATABASE_URL']).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toContain('Secreto123');
  });

  it('mapea S3_* a MINIO_* solo si el usuario no las definió', () => {
    const { values } = resolveDeployaEnv(deployaEnv({ MINIO_BUCKET: 'nimbo' }));
    expect(values).toMatchObject({
      MINIO_ENDPOINT: 'http://deploya-datos-nimbo-api-s3:9000',
      MINIO_PUBLIC_ENDPOINT: 'https://nimbo-api-s3.deploya.larasolutions.dev',
      MINIO_ACCESS_KEY: 'deploya',
      MINIO_SECRET_KEY: 'clave-s3',
      MINIO_REGION: 'us-east-1',
    });
    expect(values['MINIO_BUCKET']).toBeUndefined();
    expect(values['REDIS_URL']).toBeUndefined();
  });

  it('usa las DEPLOYA_S3_* y DEPLOYA_REDIS_URL si faltan las sin prefijo', () => {
    const env = {
      DEPLOYA_REDIS_URL: 'redis://r:6379',
      DEPLOYA_S3_ENDPOINT: 'http://s3:9000',
      DEPLOYA_S3_BUCKET: 'app',
    };
    expect(resolveDeployaEnv(env).values).toEqual({
      REDIS_URL: 'redis://r:6379',
      MINIO_ENDPOINT: 'http://s3:9000',
      MINIO_BUCKET: 'app',
    });
  });
});

describe('appRoleUrl', () => {
  it('codifica una contraseña con caracteres reservados', () => {
    expect(appRoleUrl(OWNER_URL, 'a@b/c')).toBe(
      'postgres://nimbo_app:a%40b%2Fc@deploya-datos-nimbo-api-postgres:5432/app',
    );
  });
});

describe('toShellExports', () => {
  it('produce líneas que sh evalúa sin expandir nada', () => {
    const exports = toShellExports({ RARA: `a'b $HOME \`x\` "c"` });
    const output = execFileSync('sh', ['-c', `${exports}printf %s "$RARA"`], { encoding: 'utf8' });
    expect(output).toBe(`a'b $HOME \`x\` "c"`);
  });

  /** Lo mismo que `deploya-entrypoint.sh`: `exports=$(node …)` y luego `eval "$exports"`. */
  const evalLikeEntrypoint = (exports: string, script: string): string =>
    execFileSync('sh', ['-c', `set -eu; exports=$(cat); eval "$exports"; ${script}`], {
      encoding: 'utf8',
      input: exports,
    });

  it.each([
    ['comilla simple', "cla've"],
    ['dólar y llaves', 'a$b${HOME}$(id)'],
    ['espacios', ' con  espacios '],
    ['punto y coma', 'x; echo pwned'],
    ['salto de línea al final', 'linea\n'],
    ['vacío', ''],
  ])('sobrevive al eval del entrypoint con %s', (_name, value) => {
    const exports = toShellExports({ A: value, B: 'segunda' });
    const output = evalLikeEntrypoint(exports, 'printf "%s|%s" "$A" "$B"');
    expect(output).toBe(`${value}|segunda`);
  });

  it('exporta la contraseña de nimbo_app con comillas y $ intacta dentro de DATABASE_URL', () => {
    const password = `p'a$s w"d`;
    const { values } = resolveDeployaEnv(deployaEnv({ NIMBO_APP_DB_PASSWORD: password }));
    const output = evalLikeEntrypoint(toShellExports(values), 'printf %s "$DATABASE_URL"');
    expect(decodeURIComponent(new URL(output).password)).toBe(password);
  });
});

describe('appRoleStatements', () => {
  it('crea el rol sin privilegios y fija la contraseña escapada', () => {
    const statements = appRoleStatements("cla've");
    expect(statements[0]).toContain('CREATE ROLE nimbo_app');
    expect(statements[1]).toContain('NOSUPERUSER NOBYPASSRLS');
    expect(statements[1]).toContain("PASSWORD 'cla''ve'");
  });

  it('deja la barra invertida literal', () => {
    expect(quoteLiteral('a\\b')).toBe("'a\\b'");
  });
});
