/**
 * Errores de programación del ámbito de actor (003 plan §6.3, ADR-0005). Son `Error` simples, no `DomainError`: el
 * filtro los responde como 500 genérico. Consultar datos de cliente sin actor da un error y nunca filas. Los mensajes
 * no incluyen el `id` ni el rol del actor.
 */
export class ActorScopeMissingError extends Error {
  constructor() {
    super(
      'No hay actor en la transacción: envuelve el caso de uso en ITransactionRunner.withActor(actor, …)',
    );
    this.name = new.target.name;
  }
}

export class ActorScopeConflictError extends Error {
  constructor() {
    super(
      'La transacción vigente es de otro actor o no tiene actor: abre withActor fuera de ella, nunca a mitad de otra',
    );
    this.name = new.target.name;
  }
}
