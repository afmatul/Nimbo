'use client';

import React, { useEffect, useState } from 'react';
import { PlanDto } from '@nimbo/contracts';
import { PlanCards, PlanComparisonTable } from '@/features/billing';

export default function PlanesPage() {
  const [planes, setPlanes] = useState<PlanDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://localhost:3000/api/v1/billing/plans')
    .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        setPlanes(data.planes || []);
      })
      .catch(() => {
        setError('No pudimos cargar los planes. Intenta recargar la página.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-12 text-center text-gray-500">Cargando planes...</div>;
  }

  if (error) {
    return (
      <div className="p-12 text-center text-red-600 font-medium">
        {error}
      </div>
    );
  }

  if (planes.length === 0) {
    return (
      <div className="p-12 text-center text-gray-500">
        Ahora no hay planes para mostrar.
      </div>
    );
  }

  return (
    <section className="planes">
      <header className="planes__header">
        <div>
          <h1 className="planes__title">Elige el plan de tu equipo</h1>
          <p className="planes__subtitle">Escoge la opción ideal para potenciar tu flujo de trabajo en Nimbo.</p>
        </div>
        <span className="planes__chip">Precios en quetzales · cobro mensual</span>
      </header>

      <PlanCards planes={planes} />
      <PlanComparisonTable planes={planes} />
    </section>
  );
}