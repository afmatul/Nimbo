'use client';

import type * as React from 'react';

import { MyFiles, type MyFilesProps } from '../..';

import { PreviewMenuItem } from './PreviewMenuItem';

/** Puente cliente: los wrappers de ruta solo pasan ubicación e ID de foco serializables. */
export function PreviewFiles(props: Omit<MyFilesProps, 'firstAction'>): React.JSX.Element {
  return <MyFiles {...props} firstAction={PreviewMenuItem} />;
}
