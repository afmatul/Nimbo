import type { Readable } from 'node:stream';

import { Inject, Injectable } from '@nestjs/common';

import { I_CLOCK, I_TRANSACTION_RUNNER } from '../../../shared';
import type { Actor, IClock, ITransactionRunner } from '../../../shared';
import type { File } from '../domain/file';
import { FileVersion } from '../domain/file-version';
import { ObjectKey } from '../domain/object-key';

import { FileVersionService } from './file-version.service';
import type { RegisteredVersion } from './file-version.service';
import { I_FILE_TYPE_DETECTOR } from './ports/i-file-type-detector.port';
import type { ByteReader, IFileTypeDetector } from './ports/i-file-type-detector.port';
import { I_NODE_REPOSITORY } from './ports/i-node.repository.port';
import type { INodeRepository } from './ports/i-node.repository.port';
import { I_OBJECT_STORAGE } from './ports/i-object-storage.port';
import type { IObjectStorage } from './ports/i-object-storage.port';
import { I_QUOTA_REPOSITORY } from './ports/i-quota.repository.port';
import type { IQuotaRepository } from './ports/i-quota.repository.port';
import { I_VERSION_REPOSITORY } from './ports/i-version.repository.port';
import type { IVersionRepository } from './ports/i-version.repository.port';

/** Extensión cuya firma debe tener el documento que entrega el editor (RN-1). */
const EDITED_EXTENSION = 'docx';

/** Lo que `editing` entrega al guardar una sesión (plan 016 §2). */
export interface EditedVersionInput {
  readonly fileId: string;
  /** Determinista por sesión (uuid v5): un reintento reutiliza la versión y su clave de objeto (CA-10). */
  readonly versionId: string;
  readonly editSessionId: string;
  /** Quien abrió la sesión (`abierta_por`); puede no ser el actor propietario. */
  readonly createdBy: string;
  readonly content: Readable;
  readonly sizeBytes: bigint;
}

/**
 * Resultado del registro: `duplicate` si la versión ya existía (reintento, CA-10); `corrupt` si el documento no es un
 * `.docx` íntegro y `file_missing` si el archivo ya no es del actor o se purgó (CA-14): en ambos la vigente no cambia.
 */
export type EditedVersionOutcome =
  | {
      readonly status: 'registered';
      readonly versionId: string;
      readonly versionNumber: number;
      readonly sizeBytes: bigint;
    }
  | { readonly status: 'duplicate'; readonly versionId: string }
  | { readonly status: 'corrupt' }
  | { readonly status: 'file_missing' };

type Unregistered = Exclude<EditedVersionOutcome, { status: 'registered' }>;
type Target = { readonly file: File } | Unregistered;
/** Lo que deja la transacción: la versión registrada con su archivo (para anunciarla y podar) o por qué no se registró. */
type Insertion =
  { readonly status: 'registered'; readonly registered: RegisteredVersion } | Unregistered;

const registeredOutcome = ({ version }: RegisteredVersion): EditedVersionOutcome => ({
  status: 'registered',
  versionId: version.id,
  versionNumber: version.number,
  sizeBytes: version.sizeBytes,
});

/**
 * Registra la versión de una sesión de edición (plan 016 §2, ADR-0012) con la única escritura de versiones de
 * `storage` (`FileVersionService`). Como la restauración de 014: el contenido se sube fuera de la transacción, se
 * verifica que sea un `.docx` íntegro y después, bajo `lockUsage`, se revalida y se registra **sin validar cuota**
 * (RN-8, CA-20: un sobregiro bloquea cargas, no pierde trabajo). Tras el commit se anuncia la versión (019 RN-11) y se
 * poda (CA-13). Si la transacción falla se borra lo subido y el error sigue: la versión vigente no cambia ni se anuncia
 * (Art. XI).
 */
@Injectable()
export class EditedVersionRegistrar {
  constructor(
    @Inject(I_TRANSACTION_RUNNER) private readonly transactions: ITransactionRunner,
    @Inject(I_NODE_REPOSITORY) private readonly nodes: INodeRepository,
    @Inject(I_VERSION_REPOSITORY) private readonly versions: IVersionRepository,
    @Inject(I_QUOTA_REPOSITORY) private readonly quotas: IQuotaRepository,
    @Inject(I_OBJECT_STORAGE) private readonly objects: IObjectStorage,
    @Inject(I_FILE_TYPE_DETECTOR) private readonly detector: IFileTypeDetector,
    @Inject(FileVersionService) private readonly fileVersions: FileVersionService,
    @Inject(I_CLOCK) private readonly clock: IClock,
  ) {}

  async register(actor: Actor, input: EditedVersionInput): Promise<EditedVersionOutcome> {
    const target = await this.transactions.withActor(actor, () => this.resolve(actor, input));
    if (!('file' in target)) return target;
    const key = ObjectKey.of(target.file.ownerId, target.file.id, input.versionId);
    await this.objects.putObjectStream(key.value, input.content, input.sizeBytes);
    if (!(await this.isIntactDocument(key, input.sizeBytes))) {
      await this.objects.purgeObject(key.value);
      return { status: 'corrupt' };
    }
    const insertion = await this.registerUploaded(actor, input, key);
    if (insertion.status !== 'registered') return insertion;
    await this.fileVersions.afterCommit(actor, insertion.registered);
    return registeredOutcome(insertion.registered);
  }

  /**
   * El archivo del actor, vivo o en la papelera (RN-11: la sesión sigue aunque se elimine), salvo que la versión ya
   * exista; `file_missing` solo si es ajeno o se purgó (CA-14).
   */
  private async resolve(actor: Actor, input: EditedVersionInput): Promise<Target> {
    const file = await this.nodes.findOwnedFile(actor, input.fileId);
    if (file === null) return { status: 'file_missing' };
    const existing = await this.versions.find(actor, file.id, input.versionId);
    return existing === null ? { file } : { status: 'duplicate', versionId: existing.id };
  }

  private async registerUploaded(
    actor: Actor,
    input: EditedVersionInput,
    key: ObjectKey,
  ): Promise<Insertion> {
    let insertion: Insertion;
    try {
      insertion = await this.transactions.withActor(actor, () => this.insert(actor, input, key));
    } catch (error) {
      await this.objects.purgeObject(key.value);
      throw error;
    }
    if (insertion.status === 'file_missing') await this.objects.purgeObject(key.value);
    return insertion;
  }

  /** `lockUsage` primero: con el propietario serializado, revalidar el archivo y la versión no tiene carreras. */
  private async insert(
    actor: Actor,
    input: EditedVersionInput,
    objectKey: ObjectKey,
  ): Promise<Insertion> {
    await this.quotas.lockUsage(actor);
    const target = await this.resolve(actor, input);
    if (!('file' in target)) return target;
    const registered = await this.fileVersions.register(actor, {
      file: target.file,
      buildVersion: this.versionBuilder(input, objectKey),
    });
    return { status: 'registered', registered };
  }

  private versionBuilder(input: EditedVersionInput, objectKey: ObjectKey) {
    const now = this.clock.now();
    return (number: number): FileVersion =>
      FileVersion.fromEdit({
        id: input.versionId,
        fileId: input.fileId,
        objectKey,
        sizeBytes: input.sizeBytes,
        createdBy: input.createdBy,
        editSessionId: input.editSessionId,
        number,
        now,
      });
  }

  private async isIntactDocument(key: ObjectKey, sizeBytes: bigint): Promise<boolean> {
    const result = await this.detector.detect(this.readerFor(key, sizeBytes), EDITED_EXTENSION);
    return result.ok && result.kind === EDITED_EXTENSION;
  }

  private readerFor(key: ObjectKey, sizeBytes: bigint): ByteReader {
    const size = Number(sizeBytes);
    return {
      size,
      read: (offset, length) => {
        const end = Math.min(offset + length, size);
        return end <= offset
          ? Promise.resolve(Buffer.alloc(0))
          : this.objects.getRange(key.value, offset, end - 1);
      },
    };
  }
}
