const MAX_USER_AGENT_LENGTH = 512;

export interface RegisterDeviceInput {
  readonly id: string;
  readonly userId: string;
  readonly secretHash: string;
  readonly userAgent: string;
  readonly ip: string | null;
  readonly now: Date;
}

export interface SeenDeviceInput {
  readonly userAgent: string;
  readonly ip: string | null;
  readonly now: Date;
}

const truncate = (userAgent: string): string => userAgent.slice(0, MAX_USER_AGENT_LENGTH);

/** Dispositivo conocido de una cuenta. Solo se guarda el hash del secreto de la cookie (D-4). */
export class Device {
  readonly id: string;
  readonly userId: string;
  readonly secretHash: string;
  readonly agenteUsuario: string;
  readonly ultimaIp: string | null;
  readonly ultimoAcceso: Date;

  private constructor(props: {
    readonly id: string;
    readonly userId: string;
    readonly secretHash: string;
    readonly agenteUsuario: string;
    readonly ultimaIp: string | null;
    readonly ultimoAcceso: Date;
  }) {
    this.id = props.id;
    this.userId = props.userId;
    this.secretHash = props.secretHash;
    this.agenteUsuario = props.agenteUsuario;
    this.ultimaIp = props.ultimaIp;
    this.ultimoAcceso = new Date(props.ultimoAcceso.getTime());
  }

  static register(input: RegisterDeviceInput): Device {
    return new Device({
      id: input.id,
      userId: input.userId,
      secretHash: input.secretHash,
      agenteUsuario: truncate(input.userAgent),
      ultimaIp: input.ip,
      ultimoAcceso: input.now,
    });
  }

  seen(input: SeenDeviceInput): Device {
    return new Device({
      id: this.id,
      userId: this.userId,
      secretHash: this.secretHash,
      agenteUsuario: truncate(input.userAgent),
      ultimaIp: input.ip,
      ultimoAcceso: input.now,
    });
  }
}
