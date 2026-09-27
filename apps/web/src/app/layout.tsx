import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Nimbo',
  description: 'Almacenamiento como servicio con edición colaborativa e inteligencia documental',
};

/**
 * Layout raíz de Nimbo con Inter como única familia tipográfica, idioma español y variables de tokens Cielo Sereno (CA-3).
 */
export default function RootLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <html lang="es" className={inter.variable}>
      <body className="font-sans antialiased bg-background text-foreground">{children}</body>
    </html>
  );
}
