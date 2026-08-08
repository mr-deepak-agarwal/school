import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'ui-serif', 'serif'],
        sans: ['var(--font-body)', 'ui-sans-serif', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
