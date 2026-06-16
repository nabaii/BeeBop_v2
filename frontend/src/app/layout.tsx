import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google';
import '@/styles/globals.css';
import { SessionHydrator } from '@/components/session-hydrator';

// Two-face type system (dev plan typography upgrade):
//   • Display — Bricolage Grotesque: hero question, section heads, listing names.
//   • Body   — Instrument Sans: messages, descriptions, labels, prices.
// Variable axes, self-hosted by next/font (no CDN round-trip, no layout shift).
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

const body = Instrument_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'Beebop — Find a verified home in Abuja',
  description:
    'A conversational property marketplace for Nigeria. Verified listings for off-campus student accommodation, short-let, rent, and sales.',
  metadataBase: new URL('https://beebop.store'),
};

// Honey browser/OS chrome (address bar, PWA splash) — matches the manifest.
export const viewport: Viewport = {
  themeColor: '#F0980F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body className="font-sans antialiased">
        <SessionHydrator />
        {children}
      </body>
    </html>
  );
}
