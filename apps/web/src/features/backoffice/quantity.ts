import { formatCount } from '../../lib/format-plan';

/**
 * Concordancia con la cantidad (011, revisión I-2): «la 1 cuenta» y «las 12 cuentas», con el verbo y el pronombre en
 * el mismo número («no tiene plan» / «no tienen plan»). La cifra usa el separador de miles del catálogo
 * (`formatCount` de `lib/format-plan.ts`), el mismo en toda la UI (PD-91).
 */
export interface Quantity {
  /** La cifra con el separador de miles: «1» o «1 284». */
  readonly text: string;
  /** La forma que concuerda con el número: «cuenta» o «cuentas», «tiene» o «tienen», «ella» o «ellas». */
  readonly form: (singular: string, plural: string) => string;
  /** La frase con artículo y sustantivo concordados: «la 1 cuenta» o «las 12 cuentas». */
  readonly phrase: (singular: string, plural: string) => string;
}

/**
 * La cantidad de algo, con las formas que concuerdan con ella. El artículo es el femenino («la», «las»): las cifras
 * de la 011 hablan de cuentas y de sus planes.
 */
export function quantity(count: number): Quantity {
  const one = count === 1;
  const form = (singular: string, plural: string): string => (one ? singular : plural);
  return {
    text: formatCount(count),
    form,
    phrase: (singular, plural) =>
      `${one ? 'la' : 'las'} ${formatCount(count)} ${form(singular, plural)}`,
  };
}

/** La primera letra en mayúscula, para empezar una oración (la frase del ayudante va en minúscula). */
export function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}
