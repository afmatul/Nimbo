// Fixture negativo de `boundaries.js` (plan 016 §2): `editing` no depende de `billing`; con la arista
// `identity → editing` (DF-74) cerraría el ciclo `editing → billing → identity → editing`. El plan del archivo sale
// de `IPlanLimitsProvider` de `storage` (DF-51).
export { PlanLimitsAdapter } from '../../billing';
