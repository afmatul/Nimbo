import React from 'react';
import { PlanDto } from '@nimbo/contracts';
import { formatQuetzales, formatBytes, formatEditores } from '../format-plan';

interface PlanCardsProps {
  planes: PlanDto[];
}

export const PlanCards: React.FC<PlanCardsProps> = ({ planes }) => {
  return (
    <div className="planes__grid">
      {planes.map((plan, index) => {
        // Asignamos una clase de color para el punto según el índice o slug
        const dotClasses = ['plan-card__dot--personal', 'plan-card__dot--pro', 'plan-card__dot--equipo', 'plan-card__dot--institucional'];
        const dotClass = dotClasses[index % dotClasses.length];

        return (
          <article key={plan.id} className="plan-card">
            <div className="plan-card__head">
              <span className={`plan-card__dot ${dotClass}`}></span>
              <h2 className="plan-card__name">{plan.nombre}</h2>
            </div>
            <p className="plan-card__desc">{plan.descripcion}</p>
            <div className="plan-card__price">
              <span className="plan-card__amount">{formatQuetzales(plan.precioCentavos)}</span>
              <span className="plan-card__per">al mes</span>
            </div>
            <hr className="plan-card__divider" />
            <ul className="plan-card__features">
              <li className="plan-feature">
                <svg className="plan-feature__icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span className="plan-feature__text">{formatBytes(plan.cuotaBytes)} de almacenamiento</span>
              </li>
              <li className="plan-feature">
                <svg className="plan-feature__icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span className="plan-feature__text">Máx. archivo: {formatBytes(plan.maxArchivoBytes)}</span>
              </li>
              <li className="plan-feature">
                <svg className="plan-feature__icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span className="plan-feature__text">Edición Docx: {formatEditores(plan.maxEditores)}</span>
              </li>
              <li className="plan-feature">
                <svg className="plan-feature__icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span className="plan-feature__text">{plan.consultasAgenteMensual} consultas de IA mensuales</span>
              </li>
            </ul>
            <div className="plan-card__cta">
              <button className="plan-btn plan-btn--outline">Seleccionar Plan</button>
            </div>
          </article>
        );
      })}
    </div>
  );
};