export interface PlanDomain {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string | null;
  precioCentavos: number;
  cuotaBytes: bigint;
  maxArchivoBytes: bigint;
  maxEditores: number;
  consultasAgenteMensual: number;
  versionesRetenidas: number;
  diasRetencionPapelera: number;
}
