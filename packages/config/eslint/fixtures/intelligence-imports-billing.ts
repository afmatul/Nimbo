// Fixture negativo de `boundaries.js` (plan 019 §2): `intelligence` usa `billing` solo por su `index.ts` (el cupo del
// agente, 020) y nunca entra por dentro; indexar no descuenta cupos ni lee planes (019 RN-8).
export { TypeormPlanRepository } from '../../billing/infrastructure/persistence/typeorm-plan.repository';
