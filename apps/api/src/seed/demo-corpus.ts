import { Role } from '../shared';

/**
 * Corpus de la semilla de demostración: cuentas, suscripciones, árbol de archivos, comparticiones y enlaces con los
 * casos límite que se muestran en la demo. Es solo datos: `DemoSeeder` los siembra y `SeedStore` los persiste. Todo
 * se identifica por claves naturales (correo, `slug`, ruta de nombres), así sembrar dos veces no duplica nada y los
 * UUID siguen siendo aleatorios (Art. IX.6).
 */

/** Dominio reservado de las cuentas de demostración: ninguna persona real lo usa. */
export const DEMO_EMAIL_DOMAIN = 'demo.nimbo.me';

export type AccountKey =
  | 'ana'
  | 'luis'
  | 'sofia'
  | 'marta'
  | 'carla'
  | 'diego'
  | 'nora'
  | 'pablo'
  | 'admin'
  | 'soporte'
  | 'operador';

export interface DemoAccount {
  readonly key: AccountKey;
  readonly name: string;
  readonly role: Role;
  readonly suspended: boolean;
  readonly verified: boolean;
  readonly employeeCode: string | null;
}

/** Plan propio de la demo: cuota diminuta para mostrar «casi llena» y «llena» con pocos MB reales en MinIO. */
export interface DemoPlan {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly quotaBytes: bigint;
  readonly maxFileBytes: bigint;
  readonly maxEditors: number;
  readonly agentQueriesPerMonth: number;
  readonly retainedVersions: number;
  readonly trashRetentionDays: number;
}

export interface DemoSubscription {
  readonly account: AccountKey;
  readonly planSlug: string;
  readonly readOnly: boolean;
  /** Días desde ahora hasta `vence_en` (negativo: ya venció); `null` en los planes sin vencimiento. */
  readonly endsInDays: number | null;
  readonly autoRenew: boolean;
  readonly pendingPlanSlug: string | null;
}

/** Ruta de nombres desde la raíz del propietario; `[]` es la raíz. */
export type FolderPathNames = readonly string[];

export interface DemoFile {
  readonly owner: AccountKey;
  readonly folder: FolderPathNames;
  readonly name: string;
  /** Tamaño exacto del contenido; sin él, el archivo lleva un texto corto. */
  readonly sizeBytes?: number;
}

export type DemoShareTarget =
  | { readonly kind: 'carpeta'; readonly folder: FolderPathNames }
  | { readonly kind: 'archivo'; readonly folder: FolderPathNames; readonly name: string };

export interface DemoShare {
  readonly owner: AccountKey;
  readonly recipient: AccountKey;
  readonly target: DemoShareTarget;
  readonly level: 'EDITOR' | 'VIEWER';
}

export interface DemoLink {
  readonly owner: AccountKey;
  readonly folder: FolderPathNames;
  readonly name: string;
  readonly expired: boolean;
}

export interface DemoCorpus {
  readonly catalogPlanSlugs: readonly string[];
  readonly quotaPlan: DemoPlan;
  readonly accounts: readonly DemoAccount[];
  readonly subscriptions: readonly DemoSubscription[];
  readonly folders: readonly { readonly owner: AccountKey; readonly path: FolderPathNames }[];
  readonly files: readonly DemoFile[];
  readonly shares: readonly DemoShare[];
  readonly links: readonly DemoLink[];
}

/** Lo que la semilla toma del entorno para que los casos límite sigan a la configuración. */
export interface CorpusSettings {
  readonly folderMaxDepth: number;
}

/** Los planes que siembra la migración `SembrarPlanes`: la semilla los exige, no los crea. */
const CATALOG_PLAN_SLUGS = ['personal', 'pro', 'equipo', 'institucional'] as const;

const MB = 1_000_000;

const QUOTA_PLAN: DemoPlan = {
  slug: 'demo-cuota',
  name: 'Demo de cuota',
  description:
    'Plan de demostración con 5 MB para mostrar la cuota casi llena y llena. Desactivado.',
  quotaBytes: BigInt(5 * MB),
  maxFileBytes: BigInt(2 * MB),
  maxEditors: 1,
  agentQueriesPerMonth: 5,
  retainedVersions: 1,
  trashRetentionDays: 7,
};

const client = (key: AccountKey, name: string, patch: Partial<DemoAccount> = {}): DemoAccount => ({
  key,
  name,
  role: Role.CLIENT,
  suspended: false,
  verified: true,
  employeeCode: null,
  ...patch,
});

const internal = (
  key: AccountKey,
  name: string,
  role: Role,
  employeeCode: string,
): DemoAccount => ({
  key,
  name,
  role,
  suspended: false,
  verified: true,
  employeeCode,
});

const ACCOUNTS: readonly DemoAccount[] = [
  client('ana', 'Ana Demo'),
  client('luis', 'Luis Demo'),
  client('sofia', 'Sofía Demo'),
  client('marta', 'Marta Demo'),
  client('carla', 'Carla Demo'),
  client('diego', 'Diego Demo'),
  client('nora', 'Nora Demo', { verified: false }),
  client('pablo', 'Pablo Demo', { suspended: true }),
  internal('admin', 'Administración Demo', Role.ADMIN, 'DEMO-ADM-01'),
  internal('soporte', 'Soporte Demo', Role.SUPPORT, 'DEMO-SOP-01'),
  internal('operador', 'Operación Demo', Role.OPERATOR, 'DEMO-OPE-01'),
];

const subscription = (
  account: AccountKey,
  planSlug: string,
  patch: Partial<DemoSubscription> = {},
): DemoSubscription => ({
  account,
  planSlug,
  readOnly: false,
  endsInDays: null,
  autoRenew: true,
  pendingPlanSlug: null,
  ...patch,
});

/** `nora` no tiene suscripción: la Personal nace al verificar el correo (`AccountVerifiedListener`). */
const SUBSCRIPTIONS: readonly DemoSubscription[] = [
  subscription('ana', 'pro', { endsInDays: 25 }),
  subscription('luis', 'personal'),
  subscription('sofia', 'equipo', { endsInDays: 20, pendingPlanSlug: 'pro' }),
  subscription('marta', 'pro', { endsInDays: -3, readOnly: true, autoRenew: false }),
  subscription('carla', QUOTA_PLAN.slug),
  subscription('diego', QUOTA_PLAN.slug),
  subscription('pablo', 'personal'),
];

const SHARED_FOLDER = ['Compartida con el equipo'] as const;
const SHARED_SUBFOLDER = [...SHARED_FOLDER, 'Diseño', 'Entregas finales'] as const;
const UNICODE_FOLDER = ['Nombres especiales — ñ, ü, 日本語'] as const;
const LINKS_FOLDER = ['Enlaces públicos'] as const;

/** Nombre de exactamente 255 puntos de código (el máximo de `NODE_NAME_MAX_LENGTH`), con la extensión al final. */
const longestName = (): string => {
  const extension = '.txt';
  const stem = 'Informe trimestral con un nombre larguísimo para probar el recorte en la interfaz ';
  return `${stem.repeat(4)}`.slice(0, 255 - extension.length) + extension;
};

/** Carpetas anidadas hasta el máximo configurado: crear una más dentro de la última debe rechazarse (006 CA-9). */
const deepPath = (depth: number): FolderPathNames =>
  Array.from({ length: depth }, (_, index) =>
    index === 0 ? 'Proyecto profundo' : `Nivel ${String(index + 1)}`,
  );

const folders = (settings: CorpusSettings): DemoCorpus['folders'] => [
  { owner: 'ana', path: SHARED_SUBFOLDER },
  { owner: 'ana', path: UNICODE_FOLDER },
  { owner: 'ana', path: LINKS_FOLDER },
  { owner: 'ana', path: deepPath(settings.folderMaxDepth) },
  { owner: 'ana', path: ['Carpeta vacía'] },
  { owner: 'luis', path: ['Para Ana'] },
];

const file = (
  owner: AccountKey,
  folder: FolderPathNames,
  name: string,
  sizeBytes?: number,
): DemoFile =>
  sizeBytes === undefined ? { owner, folder, name } : { owner, folder, name, sizeBytes };

const files = (settings: CorpusSettings): readonly DemoFile[] => [
  file('ana', [], 'Bienvenida.md'),
  file('ana', SHARED_FOLDER, 'Plan de trabajo.md'),
  file('ana', [...SHARED_FOLDER, 'Diseño'], 'Paleta Cielo Sereno.txt'),
  file('ana', SHARED_SUBFOLDER, 'Entrega final v3.txt'),
  file('ana', UNICODE_FOLDER, 'Presupuesto año 2026 — versión final ✓.txt'),
  file('ana', UNICODE_FOLDER, 'Ñandú & pingüino (copia).md'),
  file('ana', UNICODE_FOLDER, '日本語のメモ.txt'),
  file('ana', UNICODE_FOLDER, 'Σημειώσεις ελληνικά.txt'),
  file('ana', UNICODE_FOLDER, 'Ideas 🚀☁️ para la demo.txt'),
  file('ana', UNICODE_FOLDER, longestName()),
  file('ana', LINKS_FOLDER, 'Manual público.md'),
  file('ana', LINKS_FOLDER, 'Folleto vencido.md'),
  file('ana', deepPath(settings.folderMaxDepth), 'En lo más profundo.txt'),
  file('luis', ['Para Ana'], 'Notas de Luis.md'),
  file('marta', [], 'Contrato vigente hasta el vencimiento.md'),
  file('marta', ['Archivo histórico'], 'Respaldo 2025.txt'),
  file('pablo', [], 'Pendientes.md'),
  file('carla', [], 'Respaldo 1.bin', 2 * MB),
  file('carla', [], 'Respaldo 2.bin', 2 * MB),
  file('carla', [], 'Respaldo 3.bin', MB / 2),
  file('diego', [], 'Respaldo 1.bin', 2 * MB),
  file('diego', [], 'Respaldo 2.bin', 2 * MB),
  file('diego', [], 'Respaldo 3.bin', MB),
];

const SHARES: readonly DemoShare[] = [
  {
    owner: 'ana',
    recipient: 'luis',
    target: { kind: 'carpeta', folder: SHARED_FOLDER },
    level: 'EDITOR',
  },
  {
    owner: 'ana',
    recipient: 'sofia',
    target: { kind: 'carpeta', folder: SHARED_FOLDER },
    level: 'VIEWER',
  },
  {
    owner: 'ana',
    recipient: 'sofia',
    target: { kind: 'carpeta', folder: SHARED_SUBFOLDER },
    level: 'EDITOR',
  },
  {
    owner: 'ana',
    recipient: 'luis',
    target: {
      kind: 'archivo',
      folder: UNICODE_FOLDER,
      name: 'Presupuesto año 2026 — versión final ✓.txt',
    },
    level: 'VIEWER',
  },
  {
    owner: 'luis',
    recipient: 'ana',
    target: { kind: 'archivo', folder: ['Para Ana'], name: 'Notas de Luis.md' },
    level: 'EDITOR',
  },
];

const LINKS: readonly DemoLink[] = [
  { owner: 'ana', folder: LINKS_FOLDER, name: 'Manual público.md', expired: false },
  { owner: 'ana', folder: LINKS_FOLDER, name: 'Folleto vencido.md', expired: true },
];

/** El corpus completo para la configuración dada. */
export const demoCorpus = (settings: CorpusSettings): DemoCorpus => ({
  catalogPlanSlugs: CATALOG_PLAN_SLUGS,
  quotaPlan: QUOTA_PLAN,
  accounts: ACCOUNTS,
  subscriptions: SUBSCRIPTIONS,
  folders: folders(settings),
  files: files(settings),
  shares: SHARES,
  links: LINKS,
});

/** Correo de una cuenta de demostración (`<clave>@demo.nimbo.me`). */
export const demoEmail = (key: AccountKey): string => `${key}@${DEMO_EMAIL_DOMAIN}`;
