'use client';

import { SHARE_LEVELS, shareRequestSchema, type ShareLevel } from '@nimbo/contracts';
import * as React from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { RadioGroup } from '../../../components/ui/radio-group';
import { usePendingConfirm } from '../../storage/hooks/use-pending-confirm';
import type { AccessListState } from '../hooks/use-access-list';
import { LEVEL_LABELS } from '../share-levels';
import { shareMessageOf, type ShareMessage } from '../share-messages';
import type { ShareNodeRef } from '../sharing-api';

import { ShareErrorAlert } from './share-error-alert';

export interface ShareFormProps {
  readonly node: ShareNodeRef;
  readonly share: AccessListState['share'];
}

const LEVEL_OPTIONS = SHARE_LEVELS.map((level) => ({
  value: level,
  label: level === 'EDITOR' ? 'Editor: también edita los .docx' : 'Lector: ve y descarga',
}));

const nodeRefOf = ({ nodeType, nodeId }: ShareNodeRef): ShareNodeRef => ({ nodeType, nodeId });

/** El cuerpo ya validado con el esquema del contrato; si no pasa, el texto del campo y «Corregir el correo». */
function validate(body: ShareNodeRef & { email: string; level: ShareLevel }) {
  const parsed = shareRequestSchema.safeParse(body);
  if (parsed.success) return { body: parsed.data, invalid: null };
  const title = parsed.error.issues[0]?.message ?? '';
  return { body: null, invalid: { title, fix: 'fix_email' } satisfies ShareMessage };
}

/** Estado del formulario: correo y nivel solo aquí (spec 012b RN-2), envío con progreso y el error por `code`. */
function useShareForm(
  { node, share }: ShareFormProps,
  emailRef: React.RefObject<HTMLInputElement | null>,
) {
  const [email, setEmail] = React.useState('');
  const [level, setLevel] = React.useState<ShareLevel>('VIEWER');
  const [invalid, setInvalid] = React.useState<ShareMessage | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const { body, invalid: issue } = validate({ ...nodeRefOf(node), email, level });
  const send = async (): Promise<void> => {
    if (body === null) return;
    const entry = await share(body);
    setEmail('');
    setSuccess(
      `Listo: ${entry.grantee.displayName} ya tiene acceso como ${LEVEL_LABELS[entry.level]}.`,
    );
  };
  const pending = usePendingConfirm<ShareMessage>(send, () => undefined, shareMessageOf);
  const submitNow = (): void => {
    setSuccess(null);
    setInvalid(issue);
    if (issue === null) void pending.confirm();
  };
  const fixEmail = (): void => emailRef.current?.focus();
  const failure = invalid ?? pending.failure;
  return { email, setEmail, level, setLevel, success, failure, pending, submitNow, fixEmail };
}

interface EmailFieldProps {
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly value: string;
  readonly invalid: boolean;
  readonly onChange: (email: string) => void;
}

function EmailField({ inputRef, value, invalid, onChange }: EmailFieldProps): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="compartir-correo">Correo de la persona</Label>
      <Input
        id="compartir-correo"
        ref={inputRef}
        type="email"
        autoComplete="off"
        placeholder="nombre@dominio.com"
        value={value}
        error={invalid}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

interface ShareFeedbackProps {
  readonly form: ReturnType<typeof useShareForm>;
}

/** El error con su acción (CA-3) o el éxito anunciado (CA-2). */
function ShareFeedback({ form }: ShareFeedbackProps): React.JSX.Element {
  return (
    <>
      {form.failure ? (
        <ShareErrorAlert
          message={form.failure}
          handlers={{ retry: form.submitNow, fix_email: form.fixEmail }}
        />
      ) : null}
      {form.success ? <Alert variant="success">{form.success}</Alert> : null}
    </>
  );
}

/**
 * Formulario «Compartir» (spec 012b CA-2, CA-3): correo y nivel (Lector o Editor), «Compartiendo…» pasados 2 s, el
 * éxito anunciado y, ante un error, el mensaje con su acción conservando lo escrito.
 */
export function ShareForm(props: ShareFormProps): React.JSX.Element {
  const emailRef = React.useRef<HTMLInputElement>(null);
  const form = useShareForm(props, emailRef);
  const onSubmit = (event: React.FormEvent): void => {
    event.preventDefault();
    form.submitNow();
  };
  return (
    <form noValidate className="space-y-3" onSubmit={onSubmit}>
      <EmailField
        inputRef={emailRef}
        value={form.email}
        invalid={form.failure?.fix === 'fix_email'}
        onChange={form.setEmail}
      />
      <RadioGroup
        name="compartir-nivel"
        legend="Qué puede hacer"
        options={LEVEL_OPTIONS}
        value={form.level}
        onValueChange={(value) => form.setLevel(value as ShareLevel)}
      />
      <ShareFeedback form={form} />
      <Button type="submit" className="w-full sm:w-auto" loading={form.pending.pending}>
        {form.pending.slow ? 'Compartiendo…' : 'Compartir'}
      </Button>
    </form>
  );
}
