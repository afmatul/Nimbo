import { PlanAlreadyDeactivatedError } from '../errors/plan-already-deactivated.error';
import { PlanInvalidError } from '../errors/plan-invalid.error';
import { PlanNotDeactivatableError } from '../errors/plan-not-deactivatable.error';
import { planTermIssues } from '../plan-rules';
import type { PlanTerms } from '../plan-rules';
import { PERSONAL_PLAN_SLUG, slugFromName } from '../plan-slug';
import type { PlanLimitsSet } from '../value-objects/plan-limits-set.vo';

/** Lo que el Administrador declara al crear un plan (spec 011 CA-9). */
export interface NewPlan extends PlanTerms {
  readonly description: string | null;
}

/** Una fila de `plan` tal como la guarda la base. */
export interface PlanProps extends NewPlan {
  readonly id: string;
  readonly slug: string;
  readonly deactivatedAt: Date | null;
}

/**
 * Plan del catálogo (M4; specs 006a, 008 y 011). No se edita (RN-4): se crea, se lista y se desactiva. El estado sale
 * solo de `deactivatedAt` (nulo: se ofrece). Precio en centavos y bytes en `bigint` (ADR-0016).
 */
export class Plan implements PlanProps {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly priceCents: number;
  readonly limits: PlanLimitsSet;
  readonly deactivatedAt: Date | null;

  private constructor(props: PlanProps) {
    this.id = props.id;
    this.slug = props.slug;
    this.name = props.name;
    this.description = props.description;
    this.priceCents = props.priceCents;
    this.limits = props.limits;
    this.deactivatedAt = props.deactivatedAt;
  }

  /** Un plan leído de la base: ya cumplió las reglas al crearse (y los CHECK de `plan`). */
  static rehydrate(props: PlanProps): Plan {
    return new Plan(props);
  }

  /** CA-9 y CA-11: valida, recorta el nombre y deriva el `slug`; nace activo. */
  static create(id: string, plan: NewPlan): Plan {
    const issues = planTermIssues(plan);
    if (issues.length > 0) throw new PlanInvalidError(issues);
    const name = plan.name.trim();
    return new Plan({ ...plan, id, name, slug: slugFromName(name), deactivatedAt: null });
  }

  get isActive(): boolean {
    return this.deactivatedAt === null;
  }

  /** 009 RN-6 y CA-5: se contrata solo si se ofrece y cobra algo (Personal y los gratuitos no se pagan). */
  get isForSale(): boolean {
    return this.isActive && this.priceCents > 0;
  }

  /** 011 CA-8: Personal, el plan gratuito que recibe toda cuenta de cliente (006a). */
  get isDefault(): boolean {
    return this.slug === PERSONAL_PLAN_SLUG;
  }

  /** CA-10 y CA-11: Personal no se desactiva y un plan desactivado no se reactiva ni se vuelve a desactivar. */
  deactivate(now: Date): Plan {
    if (this.isDefault) throw new PlanNotDeactivatableError();
    if (!this.isActive) throw new PlanAlreadyDeactivatedError();
    return new Plan({ ...this, deactivatedAt: now });
  }
}
