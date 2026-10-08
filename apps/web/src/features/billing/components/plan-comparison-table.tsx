import React from 'react';
import { PlanDto } from '@nimbo/contracts';
import { formatQuetzales, formatBytes, formatEditores } from '../format-plan';

interface PlanComparisonTableProps {
  planes: PlanDto[];
}

export const PlanComparisonTable: React.FC<PlanComparisonTableProps> = ({ planes }) => {
  return (
    <div className="plan-table">
      <div className="plan-table__row plan-table__row--head">
        <span className="plan-table__th plan-table__th--label">Característica</span>
        {planes.map((plan) => (
          <span key={plan.id} className="plan-table__th">{plan.nombre}</span>
        ))}
      </div>
      <div className="plan-table__row">
        <span className="plan-table__label">Precio mensual</span>
        {planes.map((plan) => (
          <span key={plan.id} className="plan-table__cell">{formatQuetzales(plan.precioCentavos)}</span>
        ))}
      </div>
      <div className="plan-table__row">
        <span className="plan-table__label">Almacenamiento</span>
        {planes.map((plan) => (
          <span key={plan.id} className="plan-table__cell">{formatBytes(plan.cuotaBytes)}</span>
        ))}
      </div>
      <div className="plan-table__row">
        <span className="plan-table__label">Tamaño máx. por archivo</span>
        {planes.map((plan) => (
          <span key={plan.id} className="plan-table__cell">{formatBytes(plan.maxArchivoBytes)}</span>
        ))}
      </div>
      <div className="plan-table__row">
        <span className="plan-table__label">Edición de Documentos</span>
        {planes.map((plan) => (
          <span key={plan.id} className="plan-table__cell">{formatEditores(plan.maxEditores)}</span>
        ))}
      </div>
      <div className="plan-table__row">
        <span className="plan-table__label">Consultas IA mensuales</span>
        {planes.map((plan) => (
          <span key={plan.id} className="plan-table__cell">{plan.consultasAgenteMensual}</span>
        ))}
      </div>
    </div>
  );
};