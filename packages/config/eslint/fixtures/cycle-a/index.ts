// Fixture de `cycles.js` (CA-7): `cycle-a` y `cycle-b` se importan mutuamente por su `index.ts`.
import { b } from '../cycle-b';

export const a = (): string => `a${b()}`;
