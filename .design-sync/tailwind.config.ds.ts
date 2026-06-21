// DS-sync Tailwind config — extends the app's real config so the compiled
// stylesheet carries the exact Beebop theme (Hive palette, 5-token type scale),
// but widens `content` to also scan the authored preview .tsx files so any
// class a preview introduces is emitted. Run from the `frontend/` dir
// (see .design-sync/prepare.mjs), so content globs are frontend-relative.
import base from '../frontend/tailwind.config';
import type { Config } from 'tailwindcss';

const config: Config = {
  ...base,
  content: ['./src/**/*.{ts,tsx}', '../.design-sync/previews/**/*.tsx'],
};

export default config;
