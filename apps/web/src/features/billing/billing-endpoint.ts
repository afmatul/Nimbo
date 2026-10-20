/** URL de una ruta de `billing` sobre `API_PUBLIC_URL`, con o sin barra final. */
export const billingEndpoint = (apiPublicUrl: string, path: string): string =>
  `${apiPublicUrl.replace(/\/$/, '')}${path}`;
