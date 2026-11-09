import type { DownloadUrlResponse, PublicLinkDetails } from '@nimbo/contracts';

/** Ficha de ejemplo del mockup (013b §6): Andrea Morales comparte un `.docx` de 2,4 MB sin contraseña. */
export const PUBLIC_LINK_DETAILS: PublicLinkDetails = {
  name: 'Informe_trimestral_Q3.docx',
  sizeBytes: 2_400_000,
  sharedBy: { displayName: 'Andrea Morales' },
  expiresAt: '2026-11-14T20:30:00.000Z',
  requiresPassword: false,
};

/** URL firmada de 5 minutos (013 CA-10). */
export const SIGNED_DOWNLOAD: DownloadUrlResponse = {
  url: 'https://objetos.local/firmada',
  expiresAt: '2026-11-07T15:05:00.000Z',
};
