'use client';

import {
  FILE_NAME_MAX_LENGTH,
  STORAGE_ERROR_CODES,
  createFolderSchema,
  type CreateFolderInput,
  type FolderSummary,
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
import {
  folderNameConflictMessage,
  folderNameFieldMessage,
  storageMessage,
} from '../../../lib/error-catalog';
import { StorageRequestError } from '../storage-request-error';

const NAME_FIELD = 'name';
const NETWORK_FAILURE = 'No pudimos crear la carpeta. Revisa tu conexión e inténtalo de nuevo.';

export interface NewFolderDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Carpeta abierta; `null` es la raíz. */
  readonly parentId: string | null;
  /** Nombre de la carpeta abierta, o «Mis archivos». */
  readonly destinationName: string;
  /** Carpetas hermanas ya listadas: el `409` las usa para decir el nombre como está guardado (CA-3). */
  readonly siblingFolderNames: readonly string[];
  readonly createFolder: (body: CreateFolderInput) => Promise<FolderSummary>;
  readonly onCreated: (folder: FolderSummary) => void;
}

/** Resultado de un intento: error del campo (`400`, `409`) o aviso del diálogo (`422`, red y demás). */
interface Failure {
  readonly field?: string;
  readonly alert?: string;
}

function nameKey(name: string): string {
  return name.normalize('NFC').trim().toLocaleLowerCase('es');
}

/** Nombre guardado de la carpeta que choca; sin ella en la lista, el escrito sin espacios de sobra. */
function storedNameOf(typed: string, siblings: readonly string[]): string {
  return siblings.find((sibling) => nameKey(sibling) === nameKey(typed)) ?? typed.trim();
}

/** Mismas reglas que la API (`contracts`): un nombre inválido no viaja (CA-2). */
function validateName(name: string, parentId: string | null): Failure | null {
  const parsed = createFolderSchema.safeParse({ name, parentId });
  if (parsed.success) return null;
  const issue = parsed.error.issues.find((candidate) => candidate.path[0] === NAME_FIELD);
  const reason: unknown = issue && 'params' in issue ? issue.params?.['reason'] : undefined;
  return { field: folderNameFieldMessage(typeof reason === 'string' ? reason : '') };
}

function failureOf(error: unknown, typed: string, siblings: readonly string[]): Failure {
  if (!(error instanceof StorageRequestError)) return { alert: NETWORK_FAILURE };
  if (error.code === STORAGE_ERROR_CODES.STORAGE_NAME_CONFLICT) {
    return { field: folderNameConflictMessage(storedNameOf(typed, siblings)) };
  }
  const nameIssue = error.fields.find((issue) => issue.field === NAME_FIELD);
  if (nameIssue) return { field: folderNameFieldMessage(nameIssue.reason) };
  const known = storageMessage(error.code, error.details);
  return { alert: known ? `${known.cause} ${known.fix}` : NETWORK_FAILURE };
}

/** «Nueva carpeta» en la carpeta abierta (mockups `nueva-carpeta`, `nombre-invalido`, `nombre-repetido-carpeta`, `limite-niveles`). */
export function NewFolderDialog({
  open,
  onOpenChange,
  ...formProps
}: NewFolderDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <NewFolderForm {...formProps} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

type NewFolderFormProps = Omit<NewFolderDialogProps, 'open' | 'onOpenChange'> & {
  readonly onDone: () => void;
};

/** Vive dentro del contenido: al cerrar se desmonta y el siguiente «Nueva carpeta» empieza limpio. */
function NewFolderForm({
  parentId,
  destinationName,
  siblingFolderNames,
  createFolder,
  onCreated,
  onDone,
}: NewFolderFormProps): React.JSX.Element {
  const [name, setName] = React.useState('');
  const [failure, setFailure] = React.useState<Failure | null>(null);
  const [pending, setPending] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inputId = React.useId();

  React.useEffect(() => {
    if (failure?.field !== undefined) inputRef.current?.focus();
  }, [failure]);

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const invalid = validateName(name, parentId);
    if (invalid) {
      setFailure(invalid);
      return;
    }
    setPending(true);
    setFailure(null);
    try {
      const folder = await createFolder({ name, parentId });
      onCreated(folder);
      onDone();
    } catch (error) {
      setFailure(failureOf(error, name, siblingFolderNames));
      setPending(false);
    }
  };

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Nueva carpeta</DialogTitle>
        <DialogDescription>
          Se creará en <strong className="font-semibold text-foreground">{destinationName}</strong>.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor={inputId}>Nombre de la carpeta</Label>
        <Input
          ref={inputRef}
          id={inputId}
          name={NAME_FIELD}
          autoComplete="off"
          autoFocus
          maxLength={FILE_NAME_MAX_LENGTH}
          value={name}
          {...(failure?.field === undefined ? {} : { errorMessage: failure.field })}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
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
          {pending ? 'Creando…' : 'Crear carpeta'}
        </Button>
      </DialogFooter>
    </form>
  );
}
