import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Actor } from '../../shared';

import * as storage from './index';
import type { IPlanLimitsProvider, PlanLimits, PreviewDelivery, PreviewFile } from './index';

/** Igualdad estricta de tipos (patrón de `type-challenges`); un fallo aquí lo detecta `pnpm typecheck`. */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

/**
 * ISP (005 plan §6): `PlanLimits` solo lleva límites de almacenamiento: bytes y, desde 006 (plan §7, decisión 1), la
 * retención en papelera en días y, desde 007 (D-20), el nombre visible del plan que el adaptador lee en la misma fila.
 */
type _PlanLimitsShape = Expect<
  Equal<
    PlanLimits,
    {
      readonly planName: string;
      readonly maxFileBytes: bigint;
      readonly storageQuotaBytes: bigint;
      readonly trashRetentionDays: number;
    }
  >
>;
type _LimitsForSignature = Expect<
  Equal<IPlanLimitsProvider['limitsFor'], (actor: Actor) => Promise<PlanLimits>>
>;

/** 017 plan §2.3: la vista previa recibe archivo (sin clave, versión ni propietario), URL y vencimiento. */
type _PreviewFileShape = Expect<
  Equal<
    PreviewFile,
    {
      readonly id: string;
      readonly name: string;
      readonly kind: 'docx' | 'pdf' | 'texto' | 'xlsx' | 'pptx' | 'imagen' | 'otro';
      readonly folderId: string | null;
      readonly sizeBytes: bigint;
      readonly createdAt: Date;
      readonly updatedAt: Date;
    }
  >
>;
type _PreviewDeliveryShape = Expect<
  Equal<
    PreviewDelivery,
    { readonly file: PreviewFile; readonly url: string; readonly expiresAt: Date }
  >
>;
type _IssueUrlSignature = Expect<
  Equal<
    storage.StoragePreviewFacade['issueUrl'],
    (actor: Actor, fileId: string) => Promise<PreviewDelivery>
  >
>;

/**
 * API pública de `storage` (plan §6, DF-51 opción A): el token del puerto de límites, el módulo que monta la raíz de
 * composición del `api` y el del `worker` (T-51) y, desde 017 (plan §2.3), la fachada de vista previa. El detector,
 * el escáner, los repositorios y el emisor interno de URLs no salen.
 */
const RUNTIME_EXPORTS = [
  'I_PLAN_LIMITS_PROVIDER',
  'StorageModule',
  'StoragePreviewFacade',
  'StorageWorkerModule',
] as const;

describe('modules/storage/index.ts', () => {
  it('CA-3, CA-4, CA-9, RN-1, 017 CA-11: exporta exactamente el token de límites, los módulos y la fachada de vista previa', () => {
    expect(Object.keys(storage).sort()).toEqual([...RUNTIME_EXPORTS].sort());
    expect(typeof storage.I_PLAN_LIMITS_PROVIDER).toBe('symbol');
  });

  it('017 plan §2.3: el emisor interno de URLs (sin tasa ni auditoría) no sale del módulo', () => {
    expect(Object.keys(storage)).not.toContain('AccessibleFileUrlIssuer');
  });

  it('CA-9, DF-52: el escáner de cargas vencidas (único acceso sin actor) no sale del módulo', () => {
    const exported = Object.keys(storage).join(' ');

    expect(exported).not.toMatch(/Scanner|EXPIRED_UPLOAD/);
  });

  it('CA-9, DF-52: `UploadService` no recibe el escáner (solo lo inyecta el procesador de limpieza)', () => {
    const source = readFileSync(join(__dirname, 'application', 'upload.service.ts'), 'utf8');

    expect(source).not.toMatch(/I_EXPIRED_UPLOAD_SCANNER|IExpiredUploadScanner/);
  });

  it('RN-1: `plan-limits.ts` no importa `billing` (billing implementa el puerto, no al revés)', () => {
    const source = readFileSync(join(__dirname, 'application', 'plan-limits.ts'), 'utf8');

    expect(source).not.toMatch(/from\s+['"][^'"]*billing/);
  });
});
