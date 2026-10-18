import { PERSONAL_PLAN_SLUG, slugFromName } from './plan-slug';

describe('plan-slug (spec 011 RN-4)', () => {
  it('RN-4: el slug de Personal es el de la semilla de 006a', () => {
    expect(PERSONAL_PLAN_SLUG).toBe('personal');
  });

  it.each([
    ['Equipo', 'equipo'],
    ['  Pro Anual  ', 'pro-anual'],
    ['Educación Básica', 'educacion-basica'],
    ['Pro+ (2026)', 'pro-2026'],
  ])('RN-4: «%s» → %s (minúsculas, sin tildes, guiones entre palabras)', (name, slug) => {
    expect(slugFromName(name)).toBe(slug);
  });

  it('RN-4: no pasa de 50 caracteres (columna `slug`) ni termina en guion', () => {
    const slug = slugFromName(`${'a'.repeat(49)} b`);

    expect(slug).toBe('a'.repeat(49));
  });
});
