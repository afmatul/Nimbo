export interface PlanDomain {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string;
  precioCentavos: number;
  cuotaBytes: bigint;
  maxArchivoBytes: bigint;
  maxEditores: number;
  consultasAgenteMensual: number;
  versionesRetenidas: number;
  diasRetencionPapelera: number;
}