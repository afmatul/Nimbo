import type { PlanDto } from '@nimbo/contracts';
import type { ReactNode } from 'react';

import { formatQuetzales, formatBytes, formatEditores, formatCount } from '../format-plan';

interface PlanComparisonTableProps {
  readonly planes: PlanDto[];
}

export function PlanComparisonTable({ planes }: PlanComparisonTableProps): ReactNode {
  const rows = [
    {
      label: 'Precio mensual',
      render: (p: PlanDto) => formatQuetzales(p.precioCentavos),
    },
    {
      label: 'Almacenamiento',
      render: (p: PlanDto) => formatBytes(p.cuotaBytes),
    },
    {
      label: 'Tamaño máximo por archivo',
      render: (p: PlanDto) => formatBytes(p.maxArchivoBytes),
    },
    {
      label: 'Edición .docx',
      render: (p: PlanDto) => formatEditores(p.maxEditores),
    },
    {
      label: 'Editores simultáneos',
      render: (p: PlanDto) => (p.maxEditores === 0 ? '—' : formatCount(p.maxEditores)),
    },
    {
      label: 'Consultas al agente',
      render: (p: PlanDto) => `${formatCount(p.consultasAgenteMensual)} / mes`,
    },
    {
      label: 'Historial de versiones con autoría',
      render: () => 'Sí', // copy fijo, no es columna (CA-2)
    },
    {
      label: 'Versiones retenidas',
      render: (p: PlanDto) => formatCount(p.versionesRetenidas),
    },
    {
      label: 'Retención en papelera',
      render: (p: PlanDto) => `${formatCount(p.diasRetencionPapelera)} días`,
    },
  ];

  return (
    <div className="mt-6 w-full min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full border-collapse text-left text-xs">
        <caption className="sr-only">Comparación de planes</caption>
        <thead>
          <tr className="border-b border-border bg-muted/10">
            <th scope="col" className="p-4 font-medium text-muted-foreground">
              Característica
            </th>
            {planes.map((p) => (
              <th key={p.id} scope="col" className="p-4 text-center font-semibold text-foreground">
                {p.nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-border/50 hover:bg-muted/5">
              <th scope="row" className="p-4 text-left font-medium text-muted-foreground">
                {row.label}
              </th>
              {planes.map((p) => (
                <td key={p.id} className="p-4 text-center tabular-nums text-foreground">
                  {row.render(p)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
