'use client';

import { isPreviewableKind, type FileSummary } from '@nimbo/contracts';
import { Eye } from 'lucide-react';
import Link from 'next/link';
import type * as React from 'react';

import { DropdownMenuItem } from '../../../../components/ui/dropdown-menu';
import { previewPathOf } from '../routes';

export function PreviewMenuItem({
  file,
}: {
  readonly file: FileSummary;
}): React.JSX.Element | null {
  if (!isPreviewableKind(file.kind)) return null;
  return (
    <DropdownMenuItem asChild>
      <Link href={previewPathOf(file.id)} prefetch={false}>
        <Eye className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
        Previsualizar
      </Link>
    </DropdownMenuItem>
  );
}
