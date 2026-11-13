import { unzipSync } from 'fflate';

import { Role } from '../shared';

import { contentOf } from './demo-content';
import { demoCorpus } from './demo-corpus';
import type { DemoFile, FolderPathNames } from './demo-corpus';

const FOLDER_MAX_DEPTH = 10;
const corpus = demoCorpus({ folderMaxDepth: FOLDER_MAX_DEPTH });

const pathKey = (owner: string, folder: FolderPathNames): string => `${owner}:${folder.join('/')}`;
const usedBytes = (owner: string): number =>
  corpus.files
    .filter((file) => file.owner === owner)
    .reduce((sum, file: DemoFile) => sum + (file.sizeBytes ?? 0), 0);

const planOf = (slug: string) => {
  const plan = corpus.demoPlans.find((candidate) => candidate.slug === slug);
  if (plan === undefined) throw new Error(`Falta el plan ${slug}`);
  return plan;
};
const sizeOf = (file: DemoFile): number => contentOf(file).length;

describe('demoCorpus (semilla de demostración)', () => {
  it('daniela: plan gratuito de la demo con exactamente 50 MB libres, .docx reales y ningún archivo sobre el máximo', () => {
    const plan = planOf('demo-gratuito-cuota');
    const files = corpus.files.filter((file) => file.owner === 'daniela');
    const used = files.reduce((sum, file) => sum + sizeOf(file), 0);

    expect(plan.maxEditors).toBe(0);
    expect(Number(plan.quotaBytes) - used).toBe(50_000_000);
    expect(files.length).toBeGreaterThanOrEqual(20);
    expect(files.filter((file) => file.name.endsWith('.docx')).length).toBeGreaterThanOrEqual(10);
    expect(files.every((file) => sizeOf(file) <= Number(plan.maxFileBytes))).toBe(true);
    expect(
      corpus.subscriptions.find((subscription) => subscription.account === 'daniela')?.planSlug,
    ).toBe(plan.slug);
  });

  it('los .docx de la semilla son paquetes zip (PK) con el texto en word/document.xml', () => {
    const docx = corpus.files.find((file) => file.docxText !== undefined) as DemoFile;
    const bytes = contentOf(docx);

    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(Buffer.from(unzipSync(bytes)['word/document.xml'] as Uint8Array).toString()).toContain(
      (docx.docxText as string).split('\n')[0],
    );
  });

  it('cuota llena y casi llena: los archivos de relleno suman la cuota y el 90 % del plan de demostración', () => {
    const quota = Number(planOf('demo-cuota').quotaBytes);

    expect(usedBytes('diego')).toBe(quota);
    expect(usedBytes('carla')).toBe(quota * 0.9);
    expect(
      corpus.files
        .filter((file) => file.owner === 'carla' || file.owner === 'diego')
        .every((file) => (file.sizeBytes ?? 0) <= Number(planOf('demo-cuota').maxFileBytes)),
    ).toBe(true);
  });

  it('los nombres cumplen las reglas de `storage` (1–255 puntos de código, sin `/` ni `\\`) y uno llega al máximo', () => {
    const lengths = corpus.files.map((file) => Array.from(file.name).length);

    expect(Math.max(...lengths)).toBe(255);
    expect(corpus.files.every((file) => !/[/\\]/.test(file.name))).toBe(true);
  });

  it('las carpetas profundas llegan exactamente al máximo configurado', () => {
    const deepest = Math.max(...corpus.folders.map((folder) => folder.path.length));

    expect(deepest).toBe(FOLDER_MAX_DEPTH);
  });

  it('cada compartición y enlace apunta a un nodo que el corpus siembra, del mismo propietario', () => {
    const files = new Set(
      corpus.files.map((file) => `${pathKey(file.owner, file.folder)}/${file.name}`),
    );
    const folders = new Set(
      [
        ...corpus.folders,
        ...corpus.files.map((file) => ({ owner: file.owner, path: file.folder })),
      ].flatMap(({ owner, path }) =>
        path.map((_, index) => pathKey(owner, path.slice(0, index + 1))),
      ),
    );

    for (const { owner, target } of corpus.shares) {
      const exists =
        target.kind === 'carpeta'
          ? folders.has(pathKey(owner, target.folder))
          : files.has(`${pathKey(owner, target.folder)}/${target.name}`);
      expect(exists).toBe(true);
    }
    for (const link of corpus.links) {
      expect(files.has(`${pathKey(link.owner, link.folder)}/${link.name}`)).toBe(true);
    }
  });

  it('todo cliente verificado tiene suscripción; la cuenta sin verificar y las internas no', () => {
    const subscribed = new Set(corpus.subscriptions.map((subscription) => subscription.account));
    const expected = corpus.accounts
      .filter((account) => account.role === Role.CLIENT && account.verified)
      .map((account) => account.key);

    expect([...subscribed].sort()).toEqual([...expected].sort());
  });

  it('trae los casos límite: vencida en solo lectura, cambio programado, sin verificar, suspendida e internas', () => {
    expect(corpus.subscriptions).toContainEqual(
      expect.objectContaining({ readOnly: true, endsInDays: expect.any(Number) as unknown }),
    );
    expect(corpus.subscriptions.some((subscription) => subscription.pendingPlanSlug !== null)).toBe(
      true,
    );
    expect(corpus.accounts.some((account) => !account.verified)).toBe(true);
    expect(corpus.accounts.some((account) => account.suspended)).toBe(true);
    expect(new Set(corpus.accounts.map((account) => account.role))).toEqual(
      new Set(Object.values(Role)),
    );
    expect(corpus.links.map((link) => link.expired).sort()).toEqual([false, true]);
  });
});
