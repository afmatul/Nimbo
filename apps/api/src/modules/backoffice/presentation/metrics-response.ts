import type { BackofficeMetricsResponse } from '@nimbo/contracts';

import type { BackofficeMetrics, PlanClientMetric } from '../application/metrics.service';

type PlanCount = BackofficeMetricsResponse['byPlan'][number];

const toPlanCount = (metric: PlanClientMetric): PlanCount => ({
  planId: metric.planId,
  name: metric.name,
  deactivatedAt: metric.deactivatedAt?.toISOString() ?? null,
  clientCount: metric.clientCount,
});

/** `GET /backoffice/metrics` por lista blanca (011 CA-12): solo totales y conteos; bytes como texto decimal (ADR-0016). */
export const toBackofficeMetricsResponse = (
  metrics: BackofficeMetrics,
): BackofficeMetricsResponse => {
  const { accounts } = metrics;
  return {
    accounts: {
      total: accounts.total,
      clients: accounts.clients,
      internal: accounts.internal,
      byStatus: { active: accounts.active, suspended: accounts.suspended },
    },
    usedBytesTotal: accounts.usedBytesTotal.toString(),
    byPlan: metrics.byPlan.map(toPlanCount),
  };
};
