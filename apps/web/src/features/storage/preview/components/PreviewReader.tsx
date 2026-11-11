'use client';

import type { FileKind } from '@nimbo/contracts';
import type * as React from 'react';

import type { ReaderProps } from '../reader-events';

import { ImagePreview } from './ImagePreview';
import { PdfPreview } from './PdfPreview';
import { PresentationPreview } from './PresentationPreview';
import { SpreadsheetPreview } from './SpreadsheetPreview';
import { TextPreview } from './TextPreview';

type PreviewReaderProps = ReaderProps & { readonly kind: FileKind };

export function PreviewReader({ kind, ...reader }: PreviewReaderProps): React.JSX.Element | null {
  switch (kind) {
    case 'imagen':
      return <ImagePreview {...reader} />;
    case 'texto':
      return <TextPreview {...reader} />;
    case 'pdf':
      return <PdfPreview {...reader} />;
    case 'xlsx':
      return <SpreadsheetPreview {...reader} />;
    case 'pptx':
      return <PresentationPreview {...reader} />;
    default:
      return null;
  }
}
