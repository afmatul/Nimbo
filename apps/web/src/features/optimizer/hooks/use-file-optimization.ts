'use client';

import type { OptimizationStatus } from '@nimbo/contracts';
import * as React from 'react';

import type { OptimizerApi } from '../optimizer-api';

import {
  FileOptimizationPolling,
  INITIAL_OPTIMIZATION,
  type OptimizationSnapshot,
} from './file-optimization-polling';

export interface FileOptimizationView extends OptimizationSnapshot {
  readonly estimate: () => Promise<void>;
  readonly run: () => Promise<void>;
  readonly reload: () => void;
}

export function useFileOptimization(
  api: OptimizerApi,
  fileId: string,
  onCompleted: (status: OptimizationStatus) => void,
): FileOptimizationView {
  const [state, setState] = React.useState(INITIAL_OPTIMIZATION);
  const completed = React.useRef(onCompleted);
  const session = React.useRef<FileOptimizationPolling | null>(null);
  React.useEffect(() => {
    completed.current = onCompleted;
  }, [onCompleted]);
  React.useEffect(() => {
    const polling = new FileOptimizationPolling({
      api,
      fileId,
      publish: setState,
      onCompleted: (status) => completed.current(status),
    });
    session.current = polling;
    polling.start();
    return () => {
      polling.dispose();
      session.current = null;
    };
  }, [api, fileId]);
  return {
    ...state,
    estimate: () => session.current?.estimate() ?? Promise.resolve(),
    run: () => session.current?.run() ?? Promise.resolve(),
    reload: () => session.current?.revalidate(),
  };
}
