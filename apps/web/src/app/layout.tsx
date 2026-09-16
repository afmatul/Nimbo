import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Nimbo',
  description: 'Almacenamiento como servicio con edición colaborativa e inteligencia documental',
};

/** Sin hojas de estilo ni tokens: el sistema de diseño Cielo Sereno llega con la spec 000b (D-15). */
export default function RootLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
