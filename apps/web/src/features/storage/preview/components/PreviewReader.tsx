'use client';

import type { FileKind } from '@nimbo/contracts';
import type * as React from 'react';

import type { PreviewFailure } from '../preview-failure';
import type { ReaderEvents } from '../reader-events';

import { ImagePreview } from './ImagePreview';
import { TextPreview } from './TextPreview';

type PreviewReaderProps = ReaderEvents & {
  readonly kind: FileKind;
  readonly url: string;
  readonly onFailure: (failure: PreviewFailure) => void;
};

export function PreviewReader({ kind, ...reader }: PreviewReaderProps): React.JSX.Element | null {
  switch (kind) {
    case 'imagen':
      return <ImagePreview {...reader} />;
    case 'texto':
      return <TextPreview {...reader} />;
    case 'pdf':
    case 'xlsx':
    case 'pptx':
      return <p role="status">El lector de este formato está pendiente de integración.</p>;
    default:
      return null;
  }
}
