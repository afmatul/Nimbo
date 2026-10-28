import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Actor } from '../../shared';

import type { FileKind } from './domain/file-kind';

import * as storage from './index';
import type {
  FileMetadata,
  FileVersionCreatedEvent,
  FileMetadataPage,
  INodeMetadataReader,
  IPlanLimitsProvider,
  PlanLimits,
} from './index';

/** Igualdad estricta de tipos (patrón de `type-challenges`); un fallo aquí lo detecta `pnpm typecheck`. */
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

/**
 * ISP (005 plan §6): `PlanLimits` solo lleva límites de almacenamiento: bytes y, desde 006 (plan §7, decisión 1), la
 * retención en papelera en días, desde 007 (D-20) el nombre visible del plan que el adaptador lee en la misma fila,
 * desde 014 las versiones retenidas por archivo, desde 016 el máximo de editores (DF-73), desde 010 (ADR-0032
 * regla 1) si la cuenta está en solo lectura y, desde 011b (RN-1), el extra de cuota vigente.
 */
type _PlanLimitsShape = Expect<
  Equal<
    PlanLimits,
    {
      readonly planName: string;
      readonly maxFileBytes: bigint;
      readonly storageQuotaBytes: bigint;
      readonly extraQuotaBytes: bigint;
      readonly extraQuotaUntil: Date | null;
      readonly trashRetentionDays: number;
      readonly retainedVersions: number;
      readonly readOnly: boolean;
      readonly maxEditors: number;
    }
  >
>;
type _LimitsForSignature = Expect<
  Equal<IPlanLimitsProvider['limitsFor'], (actor: Actor) => Promise<PlanLimits>>
>;

/**
 * 011 plan §2, RN-1: los metadatos que lee el backoffice son solo columnas de `archivo` (sin clave de objeto, versiones
 * ni contenido); `trashedAt` es `null` si el archivo está disponible.
 */
type _FileMetadataShape = Expect<
  Equal<
    FileMetadata,
    {
      readonly id: string;
      readonly name: string;
      readonly kind: FileKind;
      readonly sizeBytes: bigint;
      readonly createdAt: Date;
      readonly updatedAt: Date;
      readonly trashedAt: Date | null;
    }
  >
>;
/** 019 plan §4: el evento lleva archivo, versión, propietario y tipo; sin nombre ni clave de objeto. */
type _FileVersionCreatedShape = Expect<
  Equal<
    FileVersionCreatedEvent,
    {
      readonly fileId: string;
      readonly versionId: string;
      readonly ownerId: string;
      readonly kind: FileKind;
    }
  >
>;
type _ListForOwnerSignature = Expect<
  Equal<
    INodeMetadataReader['listForOwner'],
    (
      actor: Actor,
      ownerId: string,
      request: { readonly page: number; readonly pageSize: number },
    ) => Promise<FileMetadataPage>
  >
>;

/**
 * API pública de `storage` (plan §6, DF-51 opción A): el token del puerto de límites, el módulo que monta la raíz de
 * composición del `api` y el del `worker` (T-51), desde 011 (PD-31) el token del lector de metadatos que consume
 * `backoffice`, el token de `IObjectStorage` para la factura PDF de `billing` (009, decisión 1) y, desde 016, la
 * fachada `EditableFileGateway` para `editing` con el 404 uniforme de un nodo (`NodeNotFoundError`, 005 CA-16:
 * `editing` responde igual que `storage`). Desde 019, el evento `storage.file-version-created` (ADR-0019: lo exporta
 * el productor) y la fachada `IndexableFileGateway` para `intelligence`. Desde 011b, la fachada `SupportTrashService`
 * para `backoffice`, con `InvalidQueryError` y los mapeadores `toTrashItem` y `toNodeSummary`. El detector, el escáner
 * y los repositorios no salen.
 */
const RUNTIME_EXPORTS = [
  'EditableFileGateway',
  'FILE_VERSION_CREATED',
  'IndexableFileGateway',
  'InvalidQueryError',
  'I_NODE_METADATA_READER',
  'I_OBJECT_STORAGE',
  'I_PLAN_LIMITS_PROVIDER',
  'NodeNotFoundError',
  'StorageModule',
  'StorageWorkerModule',
  'WritableAccountPolicy',
  'SupportTrashService',
  'invoiceObjectKey',
  'toNodeSummary',
  'toTrashItem',
] as const;

describe('modules/storage/index.ts', () => {
  it('CA-3, CA-4, CA-9, RN-1, 011 PD-31, 009, 016 §2, 019 RN-11, 012 PD-121, 011b: exporta exactamente los tokens de límites, de metadatos y de objetos, los dos módulos, las fachadas de edición, indexación y papelera de Soporte (con su error de cursor y sus mapeadores), el evento de versión y la política de solo lectura', () => {
    expect(storage.FILE_VERSION_CREATED).toBe('storage.file-version-created');
    expect(Object.keys(storage).sort()).toEqual([...RUNTIME_EXPORTS].sort());
    expect(typeof storage.I_PLAN_LIMITS_PROVIDER).toBe('symbol');
    expect(typeof storage.I_NODE_METADATA_READER).toBe('symbol');
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
