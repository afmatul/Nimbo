'use client';

import { SHARE_LEVELS, type ShareLevel } from '@nimbo/contracts';
import * as React from 'react';

import { Button } from '../../../components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { RadioGroup } from '../../../components/ui/radio-group';
import { LEVEL_LABELS } from '../../sharing';

export interface BatchShareDialogProps {
  readonly count: number;
  readonly pending: boolean;
  readonly onShare: (email: string, level: ShareLevel) => void;
  readonly onClose: () => void;
}

const LEVEL_OPTIONS = SHARE_LEVELS.map((level) => ({ value: level, label: LEVEL_LABELS[level] }));

const isShareLevel = (value: string): value is ShareLevel =>
  (SHARE_LEVELS as readonly string[]).includes(value);

/**
 * «Compartir» de la selección: la misma persona y el mismo nivel para todos (`POST /shares/batch`). La API valida el
 * correo y cada elemento; lo que falle se ve en el resultado.
 */
export function BatchShareDialog({
  count,
  pending,
  onShare,
  onClose,
}: BatchShareDialogProps): React.JSX.Element {
  const [email, setEmail] = React.useState('');
  const [level, setLevel] = React.useState<ShareLevel>('VIEWER');
  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (email.trim() !== '') onShare(email.trim(), level);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Compartir ${String(count)} elementos`}</DialogTitle>
          <DialogDescription>
            Todos se comparten con la misma persona y el mismo nivel.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="lote-correo">Correo de la persona</Label>
            <Input
              id="lote-correo"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <RadioGroup
            name="lote-nivel"
            legend="Nivel de acceso"
            options={LEVEL_OPTIONS}
            value={level}
            onValueChange={(value) => isShareLevel(value) && setLevel(value)}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              {pending ? 'Compartiendo…' : 'Compartir'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
