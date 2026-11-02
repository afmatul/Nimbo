import type { Actor } from '../../../../shared';
import type { OptimizationJob } from '../../domain/optimization-job';

/**
 * Optimizaciones de los archivos del actor (`IJobRepository` del diagrama, tabla `optimizacion`; plan 021 §2 y §3). Todo
 * corre en la transacción `withActor` del llamador; la RLS (solo el dueño del archivo) es la segunda barrera.
 */
export interface IJobRepository {
  /** La optimización `id`; `null` si no existe o no es de un archivo del actor (RLS). */
  findById(actor: Actor, id: string): Promise<OptimizationJob | null>;
  /** La más reciente del archivo, por fecha de creación; `null` si no hay. */
  latestOf(actor: Actor, fileId: string): Promise<OptimizationJob | null>;
  /** La que está en curso (`estimando` u `optimizando`), a lo sumo una por archivo. */
  findInProgress(actor: Actor, fileId: string): Promise<OptimizationJob | null>;
  /** Inserta salvo que el archivo ya tenga otra en curso (`uq_optimizacion_en_curso`); `false` si chocó. */
  insertIfNoneInProgress(actor: Actor, job: OptimizationJob): Promise<boolean>;
  /** Guarda `next` solo si la fila sigue como `previous` (mismo estado y `actualizado_en`); `false` si alguien ganó. */
  compareAndSet(actor: Actor, next: OptimizationJob, previous: OptimizationJob): Promise<boolean>;
}

export const I_JOB_REPOSITORY = Symbol('IJobRepository');
