/**
 * Inspector PWA — service worker registration via next-pwa.
 *
 * Offline strategy per dev plan §8.1:
 *   - Cache the app shell and static assets.
 *   - All form data stored in IndexedDB (src/lib/idb.ts) until online.
 *   - Background sync dispatches queued submissions on reconnect.
 *   - Sync status indicator always visible in the header.
 */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = withPWA(nextConfig);
