'use client';

import { LinkIcon } from 'lucide-react';
import type * as React from 'react';

import { Button } from '../../../components/ui/button';

import { LinkFormPanel, type LinkFormHandlers } from './public-link-form-panel';
import { ACTIONS_CLASS, FULL_ON_MOBILE } from './public-link-section-styles';
import { useFocusOnMount } from './use-focus-on-mount';

const HELP = 'Cualquiera con el enlace puede descargar este archivo, sin cuenta en Nimbo.';

interface CreatePromptProps {
  /** Vuelve aquí el foco al cancelar o tras revocar (CA-15, R-2). */
  readonly focus: boolean;
  readonly onCreate: () => void;
}

/** La ayuda y «Crear enlace público» en `outline` (CA-1, D-2). */
function CreatePrompt({ focus, onCreate }: CreatePromptProps): React.JSX.Element {
  const ref = useFocusOnMount(focus);
  return (
    <>
      <p className="text-sm text-secondary-foreground">{HELP}</p>
      <div className={ACTIONS_CLASS}>
        <Button
          ref={ref}
          type="button"
          variant="outline"
          className={FULL_ON_MOBILE}
          onClick={onCreate}
        >
          <LinkIcon aria-hidden="true" className="h-4 w-4" />
          Crear enlace público
        </Button>
      </div>
    </>
  );
}

export interface NoLinkViewProps extends CreatePromptProps {
  /** El formulario de crear está abierto. */
  readonly creating: boolean;
  readonly readOnly: boolean;
  readonly form: LinkFormHandlers;
}

/** Sin enlace: el formulario abierto, nada en solo lectura (013c CA-10) o la ayuda con «Crear enlace público». */
export function NoLinkView({
  creating,
  readOnly,
  form,
  ...prompt
}: NoLinkViewProps): React.JSX.Element | null {
  if (creating) return <LinkFormPanel link={null} form={form} />;
  if (readOnly) return null;
  return <CreatePrompt {...prompt} />;
}
