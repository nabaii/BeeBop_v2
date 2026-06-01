import type { Metadata } from 'next';
import '@/styles/globals.css';
import { SessionHydrator } from '@/components/session-hydrator';

export const metadata: Metadata = {
  title: 'BeeBop — Find a verified home in Abuja',
  description:
    'A conversational property marketplace for Nigeria. Verified listings for off-campus student accommodation, short-let, rent, and sales.',
  metadataBase: new URL('https://beebop.store'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <SessionHydrator />
        {children}
      </body>
    </html>
  );
}
