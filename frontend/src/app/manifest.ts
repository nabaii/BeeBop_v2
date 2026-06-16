import type { MetadataRoute } from 'next';

/**
 * PWA manifest (auto-linked by Next as /manifest.webmanifest). Mirrors the
 * logo kit's site.webmanifest — Honey theme on Paper, maskable triad icons.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Beebop',
    short_name: 'Beebop',
    description: 'Find a verified home in Abuja.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FCFAF6',
    theme_color: '#F0980F',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
