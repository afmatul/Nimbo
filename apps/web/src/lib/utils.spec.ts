import { cn } from './utils';

describe('cn utility', () => {
  it('combina clases simples correctamente', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('resuelve conflictos de Tailwind usando tailwind-merge (la última gana)', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('ignora valores falsy y condicionales booleanos', () => {
    const isHidden = false;
    const isVisible = true;
    expect(cn('block', isHidden && 'hidden', isVisible && 'opacity-100', undefined, null)).toBe(
      'block opacity-100',
    );
  });

  it('acepta arrays y objetos como argumentos', () => {
    expect(cn(['text-sm', 'font-bold'], { 'bg-primary': true, 'text-white': false })).toBe(
      'text-sm font-bold bg-primary',
    );
  });
});
