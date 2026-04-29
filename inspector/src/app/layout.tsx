import type { Metadata, Viewport } from 'next';

import { AppShell } from '@/components/app-shell';
import { SessionHydrator } from '@/components/session-hydrator';

import './globals.css';

export const metadata: Metadata = {
  title: 'BeeBop Inspector',
  description: 'Field inspection portal — BeeBop property verification.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#1e40af',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <SessionHydrator />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
