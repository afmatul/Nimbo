import { Role } from '../shared';

import { contentOf } from './demo-content';

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
  | 'daniela'
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
  /** Texto del documento: el archivo se siembra como un `.docx` real con un párrafo por línea. */
  readonly docxText?: string;
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
  /** Planes propios de la demo (desactivados), con cuota diminuta; el catálogo real no se toca. */
  readonly demoPlans: readonly DemoPlan[];
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

/**
 * Plan gratuito de la demo: los mismos límites que Personal (archivo máx. 50 MB, sin edición en línea) pero con 100 MB
 * de cuota. Llenar los 15 GB reales de Personal exigiría 15 GB en MinIO por cada siembra.
 */
const FREE_QUOTA_PLAN: DemoPlan = {
  slug: 'demo-gratuito-cuota',
  name: 'Demo gratuito',
  description: 'Plan de demostración con los límites de Personal y 100 MB de cuota. Desactivado.',
  quotaBytes: BigInt(100 * MB),
  maxFileBytes: BigInt(50 * MB),
  maxEditors: 0,
  agentQueriesPerMonth: 10,
  retainedVersions: 3,
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
  client('daniela', 'Daniela Demo'),
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
  subscription('daniela', FREE_QUOTA_PLAN.slug),
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

const baseFiles = (settings: CorpusSettings): readonly DemoFile[] => [
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

const doc = (folder: FolderPathNames, name: string, docxText: string): DemoFile => ({
  owner: 'daniela',
  folder,
  name,
  docxText,
});

const UNI = ['Universidad'] as const;
const THESIS = ['Universidad', 'Tesis'] as const;
const WORK = ['Trabajo'] as const;
const FAMILY = ['Familia'] as const;
const BACKUPS = ['Respaldos'] as const;
const PHOTOS = ['Fotos'] as const;

/** Con el plan gratuito los `.docx` se guardan, se previsualizan y se descargan, pero no se editan en línea. */
const DANIELA_DOCS: readonly DemoFile[] = [
  doc(
    THESIS,
    'Tesis — capítulo 1.docx',
    'Capítulo 1. Introducción\nEste trabajo estudia cómo las nubes de almacenamiento pueden facilitar la colaboración académica.\nSe plantean tres preguntas de investigación sobre versionado, permisos y búsqueda.',
  ),
  doc(
    THESIS,
    'Tesis — capítulo 2.docx',
    'Capítulo 2. Marco teórico\nSe revisan los modelos de control de acceso y la edición colaborativa en documentos de oficina.',
  ),
  doc(
    THESIS,
    'Bibliografía comentada.docx',
    'Bibliografía comentada\n1. Tanenbaum, A. Sistemas distribuidos.\n2. Kleppmann, M. Designing Data-Intensive Applications.',
  ),
  doc(
    UNI,
    'Plan de estudios.docx',
    'Plan de estudios 2026\nPrimer ciclo: Bases de datos, Ingeniería de software I, Redes.\nSegundo ciclo: Seguridad, Sistemas operativos.',
  ),
  doc(
    UNI,
    'Ensayo de ética profesional.docx',
    'Ensayo de ética profesional\nLa responsabilidad de quien custodia datos ajenos no termina con el contrato.',
  ),
  doc(
    UNI,
    'Propuesta de proyecto final.docx',
    'Propuesta de proyecto final\nObjetivo: construir una plataforma de almacenamiento con edición colaborativa.\nEntrega: noviembre de 2026.',
  ),
  doc(
    WORK,
    'Informe de práctica profesional.docx',
    'Informe de práctica profesional\nDurante ocho semanas apoyé al equipo de soporte documentando incidentes y mejorando guías internas.',
  ),
  doc(
    WORK,
    'Currículum Daniela.docx',
    'Daniela Demo\nIngeniería en Sistemas · Guatemala\nExperiencia: práctica en soporte técnico. Idiomas: español e inglés.',
  ),
  doc(
    WORK,
    'Carta de recomendación.docx',
    'Carta de recomendación\nRecomiendo a Daniela por su puntualidad, curiosidad y trabajo en equipo.',
  ),
  doc(
    WORK,
    'Acta de reunión 12-oct.docx',
    'Acta de reunión del 12 de octubre\nAsistentes: Daniela, Luis, Ana.\nAcuerdos: revisar el presupuesto y enviar la versión final el viernes.',
  ),
  doc(
    FAMILY,
    'Presupuesto familiar 2026.docx',
    'Presupuesto familiar 2026\nIngresos y gastos mensuales, con una reserva para imprevistos.',
  ),
  doc(
    FAMILY,
    'Receta de la abuela.docx',
    'Receta de la abuela\nPepián de pollo: chile guaque, pepita, tomate y mucho cariño.',
  ),
];

const DANIELA_NOTES: readonly DemoFile[] = [
  file('daniela', [], 'Pendientes de la semana.md'),
  file('daniela', UNI, 'Notas de clase — Bases de datos.md'),
  file('daniela', THESIS, 'Ideas para la tesis.txt'),
  file('daniela', FAMILY, 'Lista de compras.txt'),
];

/** Espacio usado de Daniela: quedan 50 MB libres de los 100 MB del plan (el aviso de «casi llena»). */
const DANIELA_USED_BYTES = 50 * MB;

/** Respaldos y fotos de relleno; el último absorbe lo que falta para que el uso sea exacto. */
const danielaFiles = (): readonly DemoFile[] => {
  const fixed: DemoFile[] = [
    ...DANIELA_DOCS,
    ...DANIELA_NOTES,
    file('daniela', BACKUPS, 'Copia del laptop (parte 1).bin', 12 * MB),
    file('daniela', BACKUPS, 'Copia del laptop (parte 2).bin', 12 * MB),
    file('daniela', PHOTOS, 'Vacaciones 2025.bin', 9 * MB),
    file('daniela', PHOTOS, 'Graduación.bin', 9 * MB),
  ];
  const used = fixed.reduce((sum, item) => sum + contentOf(item).length, 0);
  return [...fixed, file('daniela', PHOTOS, 'Álbum familiar.bin', DANIELA_USED_BYTES - used)];
};

const files = (settings: CorpusSettings): readonly DemoFile[] => [
  ...baseFiles(settings),
  ...danielaFiles(),
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
  demoPlans: [QUOTA_PLAN, FREE_QUOTA_PLAN],
  accounts: ACCOUNTS,
  subscriptions: SUBSCRIPTIONS,
  folders: folders(settings),
  files: files(settings),
  shares: SHARES,
  links: LINKS,
});

/** Correo de una cuenta de demostración (`<clave>@demo.nimbo.me`). */
export const demoEmail = (key: AccountKey): string => `${key}@${DEMO_EMAIL_DOMAIN}`;
