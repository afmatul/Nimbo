import type { Actor } from '../../../../shared';

/** Clientes con fila de `suscripcion` en un plan (011 CA-8, CA-12). */
export interface PlanClientCount {
  readonly planId: string;
  readonly clientCount: number;
}

/**
 * Lecturas de `suscripcion` para la administración (spec 009 T-03; ADR-0021): llaman a `nombres_de_plan_por_cliente` y
 * `conteo_de_clientes_por_plan`, que comprueban el rol del actor dentro. Se llaman dentro de `withActor(actor, …)`.
 */
export interface ISubscriptionAdministrationReader {
  /** Id del cliente → nombre del plan; un cliente sin fila no aparece. Hasta 100 ids (la función falla con más). */
  planNamesFor(actor: Actor, clientIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /** Solo planes con al menos un cliente con fila. */
  clientCountsByPlan(actor: Actor): Promise<readonly PlanClientCount[]>;
}

export const I_SUBSCRIPTION_ADMINISTRATION_READER = Symbol('ISubscriptionAdministrationReader');
