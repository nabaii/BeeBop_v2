import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#1e40af', 50: '#eff6ff', 500: '#3b82f6', 700: '#1d4ed8' },
      },
    },
  },
  plugins: [],
};

export default config;
