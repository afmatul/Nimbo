import type { ReactNode } from 'react';

import { AppLayout } from '../components/nimbo/app-layout';
import { CitationChip } from '../components/nimbo/citation-chip';
import { FileTypeChip } from '../components/nimbo/file-type-chip';
import { StateView } from '../components/nimbo/state-view';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { getEnv } from '../env';
import { getApiHealth } from '../lib/api-health';

const API_UNAVAILABLE_TEXT = 'API: no disponible. Revisa el estado de los servicios.';
const API_AVAILABLE_TEXT = 'API: disponible';

/** Se evalúa en cada petición: el estado de la API no se cachea ni se hornea en el build (CA-29). */
export const dynamic = 'force-dynamic';

/**
 * Página principal de estado de Nimbo (CA-33) con galería de componentes del sistema de diseño Cielo Sereno (Spec 000b).
 */
export default async function StatusPage(): Promise<ReactNode> {
  const env = getEnv();
  const health = await getApiHealth(env.API_INTERNAL_URL);
  const isAvailable = health.availability === 'disponible';

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Cabecera y Estado de Servicios */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Nimbo</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Plataforma de almacenamiento como servicio con edición colaborativa e inteligencia
                documental.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">Ambiente: {env.APP_ENV}</Badge>
              <Badge variant={isAvailable ? 'success' : 'destructive'}>
                {isAvailable ? API_AVAILABLE_TEXT : API_UNAVAILABLE_TEXT}
              </Badge>
              {health.version !== undefined && (
                <Badge variant="secondary" className="font-mono">
                  Versión de la API: {health.version}
                </Badge>
              )}
            </div>
          </div>
        </section>

        {/* Galería de Componentes Cielo Sereno (Spec 000b) */}
        <section className="grid gap-6 md:grid-cols-2">
          {/* Tarjeta de Botones y Formularios */}
          <Card>
            <CardHeader>
              <CardTitle>Controles e Interactivos (DF-41, DF-45)</CardTitle>
              <CardDescription>
                Botones con contraste AA (≥ 4.5:1) y campos de entrada con borde accesible
                (#7F93AA).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button>Botón Primario</Button>
                <Button variant="secondary">Secundario</Button>
                <Button variant="outline">Contorno</Button>
                <Button variant="destructive">Destructivo</Button>
                <Button loading>Cargando</Button>
              </div>
              <div className="space-y-2 pt-2">
                <label htmlFor="demo-input" className="text-xs font-semibold text-foreground">
                  Buscar archivos
                </label>
                <Input id="demo-input" placeholder="Ej. informe-final.docx..." />
              </div>
            </CardContent>
          </Card>

          {/* Tarjeta de Tipos de Archivo y Agente */}
          <Card>
            <CardHeader>
              <CardTitle>Tipos de Archivo y Agente IA (DF-44)</CardTitle>
              <CardDescription>
                Chips semánticos por extensión y panel oscuro para citas del Agente Nimbo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground block">
                  Formatos admitidos:
                </span>
                <div className="flex flex-wrap gap-2">
                  <FileTypeChip extension="docx" />
                  <FileTypeChip extension="xlsx" />
                  <FileTypeChip extension="pptx" />
                  <FileTypeChip extension="pdf" />
                  <FileTypeChip extension="png" />
                  <FileTypeChip extension="zip" />
                </div>
              </div>

              <div className="rounded-lg bg-agent-bg p-4 text-agent-text space-y-2 shadow-sm">
                <span className="text-xs font-bold text-agent-accent uppercase tracking-wider block">
                  Citas del Agente
                </span>
                <div className="flex flex-wrap gap-2 pt-1">
                  <CitationChip filename="especificacion-000b.docx" location="pág. 2" />
                  <CitationChip
                    filename="arquitectura.pdf"
                    location="sección 3"
                    isCertain={false}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Demostración de Estado de Pantalla (RNF-14) */}
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Vistas de Estado Reutilizables (RNF-14)</CardTitle>
              <CardDescription>
                Diseño predeterminado para estados de carga, vacío y error con acción correctiva.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StateView
                type="empty"
                title="Comienza subiendo tus archivos"
                description="Tus documentos estarán seguros, versionados y disponibles para edición colaborativa."
                action={{ label: 'Subir primer archivo' }}
              />
            </CardContent>
          </Card>
        </section>
      </div>
    </AppLayout>
  );
}
