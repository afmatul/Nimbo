import {
  optimizationResponseSchema,
  optimizationStatusSchema,
  type OptimizationStatus,
  type RunOptimizationBody,
} from '@nimbo/contracts';

import { parseResponse, type StorageHttp } from '../storage/storage-http';

export interface OptimizerApi {
  status(fileId: string): Promise<OptimizationStatus | null>;
  estimate(fileId: string): Promise<OptimizationStatus>;
  run(fileId: string, body: RunOptimizationBody): Promise<OptimizationStatus>;
}

export function createOptimizerApi(http: StorageHttp): OptimizerApi {
  const path = (id: string): string => `/files/${encodeURIComponent(id)}/optimization`;
  return {
    status: async (id) =>
      parseResponse(await http.get(path(id)), optimizationResponseSchema).optimization,
    estimate: async (id) =>
      parseResponse(await http.post(`${path(id)}/estimate`), optimizationStatusSchema),
    run: async (id, body) =>
      parseResponse(await http.post(`${path(id)}/run`, body), optimizationStatusSchema),
  };
}
