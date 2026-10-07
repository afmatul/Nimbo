export interface PlanDto {
  id: string;
  slug: string;
  nombre: string;
  descripcion: string;
  precioCentavos: number;
  cuotaBytes: string;
  maxArchivoBytes: string;
  maxEditores: number;
  consultasAgenteMensual: number;
  versionesRetenidas: number;
  diasRetencionPapelera: number;
}

export interface PlanCatalogResponse {
  planes: PlanDto[];
}