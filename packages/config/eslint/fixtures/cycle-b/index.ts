// Fixture de `cycles.js` (CA-7): la otra mitad del ciclo.
import { a } from '../cycle-a';

export const b = (): string => `b${typeof a}`;
