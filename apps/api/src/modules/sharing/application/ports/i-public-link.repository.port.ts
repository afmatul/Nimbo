import type { Actor } from '../../../../shared';
import type { PublicLink } from '../../domain/public-link';

/** Lo que hizo `replace`: el enlace sin revocar que había (vigente o vencido) y que ahora quedó revocado, o `null`. */
export interface PublicLinkReplacement {
  readonly previous: PublicLink | null;
}

/**
 * Enlaces públicos del propietario (`enlace_publico`, plan 013 §2). Cada método corre dentro de `withActor(actor, …)`:
 * el adaptador usa `requireActorScope` y la RLS es la segunda barrera.
 */
export interface IPublicLinkRepository {
  /**
   * CA-1, CA-4: serializa por archivo (`pg_advisory_xact_lock`), revoca el enlace sin revocar del archivo e inserta
   * `link`, ambos solo si el archivo está en `ownedNodes(actor)` (dentro de la consulta). `null`, sin escribir, si el
   * archivo ya no es propio y vivo.
   */
  replace(actor: Actor, link: PublicLink): Promise<PublicLinkReplacement | null>;
}

export const I_PUBLIC_LINK_REPOSITORY = Symbol('IPublicLinkRepository');
