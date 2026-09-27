import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina condicionalmente nombres de clases CSS y resuelve conflictos de utilidades de Tailwind CSS.
 * Es la utilidad estándar utilizada por componentes estilo shadcn/ui.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
