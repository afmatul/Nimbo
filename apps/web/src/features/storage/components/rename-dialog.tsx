'use client';

import {
  FILE_NAME_MAX_LENGTH,
  STORAGE_ERROR_CODES,
  STORAGE_NODE_FIELD_MESSAGES,
  renameFileSchema,
  type ExplorerFile,
  type ExplorerFolder,
  type NodeSummary,
  type RenameFileRequest,
  type RenameFolderInput,
  type StorageFieldIssueReason,
} from '@nimbo/contracts';
import { AlertCircle } from 'lucide-react';
import * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { cn } from '../../../lib/utils';
import { StorageRequestError } from '../storage-request-error';

import {
  NAME_FIELD,
  folderNameFailureOf,
  validateFolderName,
  type NameFailure,
} from './folder-name-failure';
import { NameConflictDialog, suggestedNameOf } from './name-conflict-dialog';

const NETWORK_FAILURE = 'No pudimos cambiar el nombre. Revisa tu conexión e inténtalo de nuevo.';

const notFoundMessage = (name: string): string =>
  `No encontramos «${name}». Puede que ya no esté en esta carpeta. Cierra y actualiza la lista.`;

export interface RenameDialogProps {
  readonly node: NodeSummary;
  /** Carpetas hermanas ya listadas: el `409` de una carpeta dice el nombre como está guardado (CA-3). */
  readonly siblingFolderNames: readonly string[];
  readonly renameFile: (fileId: string, body: RenameFileRequest) => Promise<ExplorerFile>;
  readonly renameFolder: (folderId: string, body: RenameFolderInput) => Promise<ExplorerFolder>;
  readonly onRenamed: (node: NodeSummary) => void;
  readonly onClose: () => void;
}

interface SplitName {
  readonly base: string;
  /** Con el punto («.docx»); vacía en carpetas o si el nombre no tiene extensión. */
  readonly extension: string;
}

/** La extensión de un archivo queda fija al renombrar: el tipo no cambia (CA-4). */
function splitName(node: NodeSummary): SplitName {
  const dot = node.name.lastIndexOf('.');
  if (node.type === 'folder' || dot <= 0) return { base: node.name, extension: '' };
  return { base: node.name.slice(0, dot), extension: node.name.slice(dot) };
}

function fileNameFieldMessage(reason: string): string {
  return reason in STORAGE_NODE_FIELD_MESSAGES
    ? STORAGE_NODE_FIELD_MESSAGES[reason as StorageFieldIssueReason]
    : STORAGE_NODE_FIELD_MESSAGES.INVALID_NAME;
}

/** Mismas reglas que la API para un archivo: el nombre antes de la extensión no puede quedar vacío. */
function validateFileName(base: string, fullName: string): NameFailure | null {
  if (base.trim() === '') return { field: STORAGE_NODE_FIELD_MESSAGES.REQUIRED };
  const parsed = renameFileSchema.safeParse({ name: fullName });
  if (parsed.success) return null;
  return { field: parsed.error.issues[0]?.message ?? STORAGE_NODE_FIELD_MESSAGES.INVALID_NAME };
}

/** `typed` es el nombre pedido, con la extensión. */
function fileFailureOf(error: unknown, currentName: string, typed: string): NameFailure {
  if (!(error instanceof StorageRequestError)) return { alert: NETWORK_FAILURE };
  if (error.code === STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND) {
    return { alert: notFoundMessage(currentName) };
  }
  // Sin `suggestedName` (no debería pasar): el texto de 005 para este código habla de la carga.
  if (error.code === STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT) {
    return { field: `Ya tienes un archivo llamado «${typed}» aquí. Elige otro nombre.` };
  }
  const nameIssue = error.fields.find((issue) => issue.field === NAME_FIELD);
  if (nameIssue) return { field: fileNameFieldMessage(nameIssue.reason) };
  return { alert: NETWORK_FAILURE };
}

/**
 * «Renombrar» un archivo o una carpeta (mockups `renombrar` y `renombrar-repetido`). Se monta al abrirse, así cada
 * apertura empieza con el nombre actual. Un archivo con nombre repetido pregunta «¿Conservar ambos archivos?» (005).
 */
export function RenameDialog({
  node,
  siblingFolderNames,
  renameFile,
  renameFolder,
  onRenamed,
  onClose,
}: RenameDialogProps): React.JSX.Element {
  const { base: initialBase, extension } = splitName(node);
  const [base, setBase] = React.useState(initialBase);
  const [failure, setFailure] = React.useState<NameFailure | null>(null);
  const [pending, setPending] = React.useState(false);
  const [suggestedName, setSuggestedName] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const fullName = `${base}${extension}`;
  const isFile = node.type === 'file';

  React.useEffect(() => {
    if (failure?.field !== undefined) inputRef.current?.focus();
  }, [failure]);

  const finish = (renamed: NodeSummary): void => {
    onRenamed(renamed);
    onClose();
  };

  const attempt = async (keepBoth: boolean): Promise<void> => {
    setPending(true);
    setFailure(null);
    try {
      if (node.type === 'file') {
        const onConflict = keepBoth ? 'keep_both' : 'ask';
        finish(await renameFile(node.id, { name: fullName, onConflict }));
      } else {
        finish(await renameFolder(node.id, { name: base }));
      }
    } catch (error) {
      setPending(false);
      const suggested = isFile ? suggestedNameOf(error) : null;
      if (suggested !== null) setSuggestedName(suggested);
      else setFailure(failureOf(error));
    }
  };

  const failureOf = (error: unknown): NameFailure =>
    isFile
      ? fileFailureOf(error, node.name, fullName)
      : folderNameFailureOf(error, base, siblingFolderNames, NETWORK_FAILURE);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (pending) return;
    const invalid = isFile ? validateFileName(base, fullName) : validateFolderName(base);
    if (invalid) setFailure(invalid);
    else void attempt(false);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
      >
        <form noValidate onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{isFile ? 'Renombrar archivo' : 'Renombrar carpeta'}</DialogTitle>
            <DialogDescription className="break-words">
              Cambia el nombre de{' '}
              <strong className="font-semibold text-foreground">{node.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <NameField
            ref={inputRef}
            value={base}
            extension={extension}
            error={failure?.field}
            onChange={(value) => {
              setBase(value);
              setFailure(null);
            }}
          />
          {failure?.alert !== undefined ? (
            <Alert variant="error" className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{failure.alert}</span>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              {pending ? 'Guardando…' : 'Guardar nombre'}
            </Button>
          </DialogFooter>
        </form>
        <NameConflictDialog
          open={suggestedName !== null}
          fileName={fullName}
          finalName={suggestedName ?? ''}
          othersCount={0}
          onKeepBoth={() => {
            setSuggestedName(null);
            void attempt(true);
          }}
          onDiscard={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

interface NameFieldProps {
  readonly value: string;
  /** Sufijo fijo y no editable («.docx»); vacío, sin sufijo. */
  readonly extension: string;
  readonly error: string | undefined;
  readonly onChange: (value: string) => void;
}

/** Campo «Nombre» con la extensión como sufijo, que los lectores de pantalla leen como descripción. */
const NameField = React.forwardRef<HTMLInputElement, NameFieldProps>(
  ({ value, extension, error, onChange }, ref) => {
    const inputId = React.useId();
    const suffixId = `${inputId}-sufijo`;
    const errorId = `${inputId}-error`;
    const describedBy = [error === undefined ? '' : errorId, extension === '' ? '' : suffixId]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="grid gap-1.5">
        <Label htmlFor={inputId}>Nombre</Label>
        <div className="flex">
          <Input
            ref={ref}
            id={inputId}
            name={NAME_FIELD}
            autoComplete="off"
            maxLength={FILE_NAME_MAX_LENGTH - extension.length}
            value={value}
            error={error !== undefined}
            aria-describedby={describedBy === '' ? undefined : describedBy}
            className={cn('min-w-0', extension !== '' && 'rounded-r-none')}
            onChange={(event) => onChange(event.target.value)}
          />
          {extension === '' ? null : (
            <span
              id={suffixId}
              className="flex shrink-0 items-center rounded-r-md border border-l-0 border-input bg-muted px-3 text-sm text-secondary-foreground"
            >
              {extension}
            </span>
          )}
        </div>
        {error === undefined ? null : (
          <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  },
);
NameField.displayName = 'NameField';
