import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { TransactionContext } from '../shared';
import type { Actor } from '../shared';

import type { DemoPlan, DemoShare, DemoSubscription } from './demo-corpus';

/** Una cuenta lista para insertar: el hash ya es Argon2id (PHC) y el correo está normalizado. */
export interface UserRow {
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: string;
  readonly suspended: boolean;
  readonly verified: boolean;
  readonly employeeCode: string | null;
  /** `null` en las cuentas internas: solo un cliente acepta los Términos al registrarse. */
  readonly termsVersion: string | null;
  readonly privacyVersion: string | null;
}

export interface FolderRef {
  readonly id: string;
  /** `carpeta.ruta`: `/<id raíz>/…/<id>/` (`FolderPath`). */
  readonly path: string;
  readonly depth: number;
}

export interface FileRow {
  readonly id: string;
  readonly versionId: string;
  readonly folderId: string | null;
  readonly name: string;
  readonly kind: string;
  readonly sizeBytes: bigint;
  readonly objectKey: string;
}

const PLANS_PRESENT_SQL = 'SELECT slug FROM plan WHERE slug = ANY($1::text[])';
const PLAN_ID_SQL = 'SELECT id FROM plan WHERE slug = $1';
const INSERT_PLAN_SQL = `INSERT INTO plan (nombre, slug, descripcion, precio_centavos, cuota_bytes, max_archivo_bytes,
    max_editores, consultas_agente_mensual, versiones_retenidas, dias_retencion_papelera, desactivado_en)
  VALUES ($1, $2, $3, 0, $4::bigint, $5::bigint, $6, $7, $8, $9, now())
  ON CONFLICT (slug) DO NOTHING RETURNING id`;
const USER_ID_SQL = 'SELECT id FROM usuario WHERE correo = $1';
const INSERT_USER_SQL = `INSERT INTO usuario (nombre, correo, hash_clave, rol, estado, correo_verificado,
    codigo_empleado, version_terminos, version_privacidad, terminos_aceptados_en)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8::varchar, $9, CASE WHEN $8::varchar IS NULL THEN NULL ELSE now() END)
  ON CONFLICT (correo) DO NOTHING RETURNING id`;
/** `iniciado_en` un mes antes del vencimiento (o ahora, sin vencimiento): una vencida empezó en el pasado. */
const INSERT_SUBSCRIPTION_SQL = `WITH fin AS (
    SELECT CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(days => $3::int) END AS vence_en)
  INSERT INTO suscripcion (usuario_id, plan_id, iniciado_en, vence_en, estado, renovacion_automatica,
    plan_pendiente_id)
  SELECT $1, $2, LEAST(now(), fin.vence_en - interval '1 month'), fin.vence_en, $4, $5, $6 FROM fin
  ON CONFLICT (usuario_id) DO NOTHING RETURNING id`;
const CHILD_FOLDER_SQL = `SELECT id, ruta, profundidad FROM carpeta
  WHERE propietario_id = $1 AND carpeta_padre_id IS NOT DISTINCT FROM $2::uuid AND lower(nombre) = lower($3)
    AND eliminado_en IS NULL`;
const INSERT_FOLDER_SQL = `INSERT INTO carpeta (id, propietario_id, carpeta_padre_id, nombre, ruta, profundidad,
    creado_en, actualizado_en)
  VALUES ($1, $2, $3, $4, $5, $6, now(), now())`;
const FILE_ID_SQL = `SELECT id FROM archivo
  WHERE propietario_id = $1 AND carpeta_id IS NOT DISTINCT FROM $2::uuid AND lower(nombre) = lower($3)
    AND eliminado_en IS NULL`;
const INSERT_FILE_SQL = `INSERT INTO archivo (id, propietario_id, carpeta_id, nombre, tipo, tamano_bytes,
    version_actual_id, creado_en, actualizado_en)
  VALUES ($1, $2, $3, $4, $5, $6::bigint, $7, now(), now())`;
const INSERT_VERSION_SQL = `INSERT INTO version_archivo (id, archivo_id, origen, clave_objeto, tamano_bytes,
    creado_por, creada_en, numero)
  VALUES ($1, $2, 'carga', $3, $4::bigint, $5, now(), 1)`;
/** La misma suma que registra una carga (`TypeOrmQuotaRepository`): la conciliación de 007 no encuentra diferencia. */
const ADD_USED_BYTES_SQL =
  'UPDATE usuario SET espacio_usado = espacio_usado + $1::bigint WHERE id = $2';
const INSERT_SHARE_SQL = `INSERT INTO comparticion (propietario_id, destinatario_id, archivo_id, carpeta_id, nivel)
  VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING id`;
const LINK_EXISTS_SQL = `SELECT 1 FROM enlace_publico
  WHERE archivo_id = $1 AND revocado_en IS NULL AND (vence_en <= now()) = $2`;
/** Vencido: creado hace 30 días con 7 de vigencia. Activo: 7 días desde ahora. */
const INSERT_LINK_SQL = `INSERT INTO enlace_publico (archivo_id, propietario_id, token_hash, creado_en, vence_en)
  SELECT $1, $2, $3, inicio, inicio + interval '7 days'
  FROM (SELECT CASE WHEN $4::boolean THEN now() - interval '30 days' ELSE now() END AS inicio) AS momento`;

type IdRow = { readonly id: string };

/**
 * Persistencia de la semilla de demostración: SQL «buscar o crear» por claves naturales, como `nimbo_app` y bajo RLS
 * (las filas de cliente se escriben dentro de `withActor` de su dueño, así las políticas validan la propiedad igual
 * que en la app). Lo que ya existe no se toca: sembrar en cada arranque no duplica ni sobrescribe.
 */
@Injectable()
export class SeedStore {
  constructor(@Inject(TransactionContext) private readonly context: TransactionContext) {}

  async missingPlans(slugs: readonly string[]): Promise<string[]> {
    const rows = (await this.context.manager().query(PLANS_PRESENT_SQL, [slugs])) as {
      slug: string;
    }[];
    const present = new Set(rows.map((row) => row.slug));
    return slugs.filter((slug) => !present.has(slug));
  }

  async insertPlanIfMissing(plan: DemoPlan): Promise<boolean> {
    const rows = (await this.context
      .manager()
      .query(INSERT_PLAN_SQL, [
        plan.name,
        plan.slug,
        plan.description,
        plan.quotaBytes.toString(),
        plan.maxFileBytes.toString(),
        plan.maxEditors,
        plan.agentQueriesPerMonth,
        plan.retainedVersions,
        plan.trashRetentionDays,
      ])) as IdRow[];
    return rows.length > 0;
  }

  async planId(slug: string): Promise<string> {
    const [row] = (await this.context.manager().query(PLAN_ID_SQL, [slug])) as IdRow[];
    if (row === undefined)
      throw new Error(`Falta el plan «${slug}» del catálogo: corre las migraciones.`);
    return row.id;
  }

  async userId(email: string): Promise<string | null> {
    const [row] = (await this.context.manager().query(USER_ID_SQL, [email])) as IdRow[];
    return row?.id ?? null;
  }

  async insertUser(user: UserRow): Promise<string | null> {
    const [row] = (await this.context
      .manager()
      .query(INSERT_USER_SQL, [
        user.name,
        user.email,
        user.passwordHash,
        user.role,
        user.suspended ? 'suspendida' : 'activa',
        user.verified,
        user.employeeCode,
        user.termsVersion,
        user.privacyVersion,
      ])) as IdRow[];
    return row?.id ?? null;
  }

  async insertSubscription(
    owner: Actor,
    plan: SubscriptionPlans,
    wanted: DemoSubscription,
  ): Promise<boolean> {
    const rows = (await this.scoped(owner).query(INSERT_SUBSCRIPTION_SQL, [
      owner.id,
      plan.planId,
      wanted.endsInDays,
      wanted.readOnly ? 'solo_lectura' : 'vigente',
      wanted.autoRenew,
      plan.pendingPlanId,
    ])) as IdRow[];
    return rows.length > 0;
  }

  async childFolder(
    owner: Actor,
    parentId: string | null,
    name: string,
  ): Promise<FolderRef | null> {
    const [row] = (await this.scoped(owner).query(CHILD_FOLDER_SQL, [
      owner.id,
      parentId,
      name,
    ])) as {
      id: string;
      ruta: string;
      profundidad: number;
    }[];
    return row === undefined ? null : { id: row.id, path: row.ruta, depth: row.profundidad };
  }

  async insertFolder(
    owner: Actor,
    parentId: string | null,
    folder: FolderRef & { name: string },
  ): Promise<void> {
    await this.scoped(owner).query(INSERT_FOLDER_SQL, [
      folder.id,
      owner.id,
      parentId,
      folder.name,
      folder.path,
      folder.depth,
    ]);
  }

  async fileId(owner: Actor, folderId: string | null, name: string): Promise<string | null> {
    const [row] = (await this.scoped(owner).query(FILE_ID_SQL, [
      owner.id,
      folderId,
      name,
    ])) as IdRow[];
    return row?.id ?? null;
  }

  /** Archivo, su versión 1 y el espacio usado, en la transacción del dueño: o entra todo o nada. */
  async insertFile(owner: Actor, file: FileRow): Promise<void> {
    const manager = this.scoped(owner);
    const size = file.sizeBytes.toString();
    await manager.query(INSERT_FILE_SQL, [
      file.id,
      owner.id,
      file.folderId,
      file.name,
      file.kind,
      size,
      file.versionId,
    ]);
    await manager.query(INSERT_VERSION_SQL, [
      file.versionId,
      file.id,
      file.objectKey,
      size,
      owner.id,
    ]);
    await manager.query(ADD_USED_BYTES_SQL, [size, owner.id]);
  }

  async insertShare(owner: Actor, share: ShareRow): Promise<boolean> {
    const rows = (await this.scoped(owner).query(INSERT_SHARE_SQL, [
      owner.id,
      share.recipientId,
      share.fileId,
      share.folderId,
      share.level,
    ])) as IdRow[];
    return rows.length > 0;
  }

  async hasLink(owner: Actor, fileId: string, expired: boolean): Promise<boolean> {
    const rows = (await this.scoped(owner).query(LINK_EXISTS_SQL, [fileId, expired])) as unknown[];
    return rows.length > 0;
  }

  async insertLink(owner: Actor, link: LinkRow): Promise<void> {
    await this.scoped(owner).query(INSERT_LINK_SQL, [
      link.fileId,
      owner.id,
      link.tokenHash,
      link.expired,
    ]);
  }

  private scoped(owner: Actor): EntityManager {
    return this.context.requireActorScope(owner);
  }
}

export interface SubscriptionPlans {
  readonly planId: string;
  readonly pendingPlanId: string | null;
}

export interface ShareRow {
  readonly recipientId: string;
  readonly fileId: string | null;
  readonly folderId: string | null;
  readonly level: DemoShare['level'];
}

export interface LinkRow {
  readonly fileId: string;
  readonly tokenHash: string;
  readonly expired: boolean;
}
