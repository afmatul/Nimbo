// Fixture de `cycles.js` (CA-7): importa `cycle-a` sin cerrar un ciclo.
import { a } from '../cycle-a';

export const c = (): string => a();
