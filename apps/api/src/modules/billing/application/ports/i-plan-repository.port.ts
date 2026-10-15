import type { Plan } from '../../domain/plan.entity';

/**
 * Catálogo `plan` (specs 006a, 008 y 011). Usa el `EntityManager` de `TransactionContext`: se une a la transacción del
 * llamador, así el alta o la baja de un plan y su evento de auditoría se confirman juntos (011 R-3). `plan` no tiene
 * RLS: es el catálogo público.
 */
export interface IPlanRepository {
  /** 008 CA-1: los que se ofrecen (`desactivado_en` nulo, PD-76), por precio y después por `slug`. */
  findActive(): Promise<Plan[]>;
  findById(id: string): Promise<Plan | null>;
  findBySlug(slug: string): Promise<Plan | null>;
  /** 011 CA-9: `false` si el nombre o el `slug` ya son de otro plan (`ON CONFLICT DO NOTHING`, sin carreras). */
  insert(plan: Plan): Promise<boolean>;
  /** 011 CA-10: guarda `deactivatedAt` solo si seguía activo (CAS); `false` si otro lo desactivó antes. */
  deactivate(plan: Plan): Promise<boolean>;
}

export const I_PLAN_REPOSITORY = Symbol('IPlanRepository');
