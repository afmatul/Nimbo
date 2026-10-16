'use client';

import type { FileSummary } from '@nimbo/contracts';
import { Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type * as React from 'react';

import { MyFiles, type MyFilesProps } from '../..';
import { DropdownMenuItem } from '../../../../components/ui/dropdown-menu';
import { previewPathOf } from '../routes';

export function PreviewMenuItem({
  file,
}: {
  readonly file: FileSummary;
}): React.JSX.Element | null {
  const router = useRouter();
  if (file.kind === 'docx' || file.kind === 'otro') return null;
  return (
    <DropdownMenuItem onSelect={() => router.push(previewPathOf(file.id))}>
      <Eye className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
      Previsualizar
    </DropdownMenuItem>
  );
}

/** Puente cliente: los wrappers de ruta solo pasan ubicación e ID de foco serializables. */
export function PreviewFiles(props: Omit<MyFilesProps, 'firstAction'>): React.JSX.Element {
  return <MyFiles {...props} firstAction={PreviewMenuItem} />;
}
