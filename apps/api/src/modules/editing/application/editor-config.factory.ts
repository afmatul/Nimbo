import type { EditableFile } from '../../storage';
import type { EditModeDecision } from '../domain/edit-mode-policy';

import type { ContentLinkSigner } from './content-link.signer';
import { CALLBACK_LINK_PARAMETER, CALLBACK_PATH, CONTENT_PATH } from './editing-config';
import type { OnlyOfficeConnection } from './editing-config';
import type { IDocumentEditor } from './ports/i-document-editor.port';

/** Clave del documento en solo lectura: sin sesión, la da la versión (plan §4). */
const VIEW_KEY_PREFIX = 'v-';
const EDITOR_LANGUAGE = 'es';

/** Lo que define la configuración: el archivo, el modo decidido, la sesión (en edición) y quien abre. */
export interface EditorConfigInput {
  readonly file: EditableFile;
  readonly decision: EditModeDecision;
  readonly sessionId: string | null;
  /** Nombre visible que pone el servidor (RN-12), nunca el del cliente. */
  readonly user: { readonly id: string; readonly name: string };
}

export interface EditorLaunch {
  readonly documentServerUrl: string;
  readonly config: Readonly<Record<string, unknown>>;
}

/**
 * Configuración del editor ONLYOFFICE (plan 016 §4), firmada por `IDocumentEditor`: en edición la clave es la sesión,
 * el contenido se lee con un enlace de sesión y los avisos llegan a `callbackUrl`; en solo lectura, la clave y el
 * enlace son de la versión vigente y no hay avisos. El contenido sale del `api` (nunca una URL de MinIO, plan §1).
 */
export class EditorConfigFactory {
  constructor(
    private readonly connection: OnlyOfficeConnection,
    private readonly links: ContentLinkSigner,
    private readonly editor: IDocumentEditor,
  ) {}

  build(input: EditorConfigInput): EditorLaunch {
    const config = {
      documentType: 'word',
      document: {
        fileType: input.file.kind,
        key: this.keyOf(input),
        title: input.file.name,
        url: `${this.connection.callbackBaseUrl}${CONTENT_PATH}/${this.linkOf(input)}`,
        permissions: { edit: input.decision.mode === 'edit' },
      },
      editorConfig: {
        mode: input.decision.mode,
        lang: EDITOR_LANGUAGE,
        user: { id: input.user.id, name: input.user.name },
        ...this.callbackOf(input),
      },
    };
    return { documentServerUrl: this.connection.publicUrl, config: this.editor.signConfig(config) };
  }

  /** Solo en edición hay aviso de guardado: lleva su enlace firmado con la sesión y la propietaria (plan §4). */
  private callbackOf({ file, sessionId }: EditorConfigInput): { callbackUrl?: string } {
    if (sessionId === null) return {};
    const url = new URL(`${this.connection.callbackBaseUrl}${CALLBACK_PATH}`);
    url.searchParams.set(
      CALLBACK_LINK_PARAMETER,
      this.links.forCallback({ sessionId, ownerId: file.ownerId }),
    );
    return { callbackUrl: url.toString() };
  }

  private keyOf(input: EditorConfigInput): string {
    return input.sessionId ?? `${VIEW_KEY_PREFIX}${input.file.currentVersionId}`;
  }

  private linkOf({ file, sessionId }: EditorConfigInput): string {
    return sessionId === null
      ? this.links.forVersion({
          fileId: file.id,
          versionId: file.currentVersionId,
          ownerId: file.ownerId,
        })
      : this.links.forSession({ sessionId, ownerId: file.ownerId });
  }
}
