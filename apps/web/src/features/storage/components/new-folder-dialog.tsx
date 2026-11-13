'use client';

import { FILE_NAME_MAX_LENGTH, type CreateFolderInput, type ExplorerFolder } from '@nimbo/contracts';
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
  NAME_FIELD,
  folderNameFailureOf,
  validateFolderName,
  type NameFailure,
} from './folder-name-failure';

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
  readonly createFolder: (body: CreateFolderInput) => Promise<ExplorerFolder>;
  readonly onCreated: (folder: ExplorerFolder) => void;
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
  const [failure, setFailure] = React.useState<NameFailure | null>(null);
  const [pending, setPending] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inputId = React.useId();

  React.useEffect(() => {
    if (failure?.field !== undefined) inputRef.current?.focus();
  }, [failure]);

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const invalid = validateFolderName(name);
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
      setFailure(folderNameFailureOf(error, name, siblingFolderNames, NETWORK_FAILURE));
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
