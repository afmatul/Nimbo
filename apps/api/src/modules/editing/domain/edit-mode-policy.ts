import { EditingUnsupportedFormatError } from './errors';

/** Único tipo de `archivo.tipo` que se edita en línea (RN-1, ADR-0004). */
const EDITABLE_KIND = 'docx';

/** Motivos de solo lectura. Coinciden con `READ_ONLY_REASONS` de `contracts/editing` (el dominio no lo importa). */
export type ReadOnlyReason =
  | 'EDITING_VIEW_ONLY'
  | 'EDITING_PLAN_READ_ONLY'
  | 'EDITING_OWNER_PLAN_READ_ONLY'
  | 'EDITING_ACCOUNT_READ_ONLY'
  | 'EDITING_LIMIT_REACHED'
  | 'EDITING_FILE_TOO_LARGE';

export type EditModeDecision =
  | { readonly mode: 'edit'; readonly readOnlyReason: null }
  | { readonly mode: 'view'; readonly readOnlyReason: ReadOnlyReason };

/** Lo que decide el modo, ya resuelto por la aplicación. Ninguna cifra vive aquí (RN-3, RN-10). */
export interface EditModeInput {
  /** `archivo.tipo`. */
  readonly kind: string;
  /** Nivel Propietario o Editor sobre el archivo (RN-2); un Lector no edita. */
  readonly canEdit: boolean;
  readonly openedByOwner: boolean;
  /** Máximo de editores del plan de la **cuenta propietaria** (RN-3); `0` = plan sin edición (Personal). */
  readonly ownerMaxEditors: number;
  /** La cuenta propietaria está en solo lectura por vencimiento (spec 010 RN-6, RN-11, CA-13): nadie edita. */
  readonly ownerReadOnly: boolean;
  /** Editores en la sesión sin contar a quien abre; la solo lectura no cuenta (CA-7). */
  readonly activeEditors: number;
  readonly sizeBytes: bigint;
  /** Tope editable de `EDITING_MAX_DOC_BYTES` (RN-10). */
  readonly maxDocBytes: bigint;
}

const EDIT: EditModeDecision = Object.freeze({ mode: 'edit', readOnlyReason: null });

const viewOnly = (readOnlyReason: ReadOnlyReason): EditModeDecision =>
  Object.freeze({ mode: 'view', readOnlyReason });

/** Motivo de solo lectura por plan: el texto difiere si abre la propietaria o un coeditor (CA-5, CA-22). */
const planReason = (input: EditModeInput): ReadOnlyReason =>
  input.openedByOwner ? 'EDITING_PLAN_READ_ONLY' : 'EDITING_OWNER_PLAN_READ_ONLY';

/**
 * Cuenta propietaria vencida (spec 010): la propietaria ve su motivo con «Renovar plan»; un coeditor, el de la cuenta
 * propietaria, que no dice si es el plan o el vencimiento porque es de otra cuenta (CA-22).
 */
const accountReason = (input: EditModeInput): ReadOnlyReason =>
  input.openedByOwner ? 'EDITING_ACCOUNT_READ_ONLY' : 'EDITING_OWNER_PLAN_READ_ONLY';

/**
 * Modo con que se abre un documento (plan 016 §2), puro. Abrir responde siempre con un modo; solo un formato distinto
 * de `.docx` es error (CA-4). Precedencia: nivel, cuenta propietaria vencida (010), plan de la propietaria, tamaño y,
 * al final, lugar libre: así el
 * motivo nunca invita a esperar algo que no cambiaría el resultado.
 */
export const EditModePolicy = Object.freeze({
  /** Solo `.docx` se abre en el editor, ni siquiera en solo lectura (CA-4). */
  assertEditable(kind: string): void {
    if (kind !== EDITABLE_KIND) throw new EditingUnsupportedFormatError();
  },

  decide(input: EditModeInput): EditModeDecision {
    EditModePolicy.assertEditable(input.kind);
    if (!input.canEdit) return viewOnly('EDITING_VIEW_ONLY');
    if (input.ownerReadOnly) return viewOnly(accountReason(input));
    if (input.ownerMaxEditors === 0) return viewOnly(planReason(input));
    if (input.sizeBytes > input.maxDocBytes) return viewOnly('EDITING_FILE_TOO_LARGE');
    if (input.activeEditors >= input.ownerMaxEditors) return viewOnly('EDITING_LIMIT_REACHED');
    return EDIT;
  },
});
