import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'FauveF16 · Studio 3D Tech Pack',
  description: 'Studio 3D multi-produits et export Tech Pack',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body
        className="bg-[#0B0D10] text-[#E6E8EC] antialiased"
        style={{ margin: 0 }}
      >
        {children}
      </body>
    </html>
  );
}
