import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Nimbo',
  description: 'Almacenamiento como servicio con edición colaborativa e inteligencia documental',
};

/**
 * Layout raíz de Nimbo con fuentes Inter y JetBrains Mono, idioma español y variables de tokens Cielo Sereno (CA-3).
 */
export default function RootLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased bg-background text-foreground">{children}</body>
    </html>
  );
}
