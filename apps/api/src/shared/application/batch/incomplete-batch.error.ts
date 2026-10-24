/**
 * Una pasada del `worker` terminó con elementos fallidos (PD-63): se lanza al final para que BullMQ la reintente y la
 * conserve como fallida. Cada módulo la extiende con su mensaje; el nombre es el de la subclase.
 */
export abstract class IncompleteBatchError extends Error {
  protected constructor(
    readonly failed: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
