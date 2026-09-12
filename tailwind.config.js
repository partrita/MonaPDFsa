/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        rp: {
          base: 'rgb(var(--rp-base) / <alpha-value>)',
          surface: 'rgb(var(--rp-surface) / <alpha-value>)',
          overlay: 'rgb(var(--rp-overlay) / <alpha-value>)',
          muted: 'rgb(var(--rp-muted) / <alpha-value>)',
          subtle: 'rgb(var(--rp-subtle) / <alpha-value>)',
          text: 'rgb(var(--rp-text) / <alpha-value>)',
          love: 'rgb(var(--rp-love) / <alpha-value>)',
          gold: 'rgb(var(--rp-gold) / <alpha-value>)',
          rose: 'rgb(var(--rp-rose) / <alpha-value>)',
          pine: 'rgb(var(--rp-pine) / <alpha-value>)',
          foam: 'rgb(var(--rp-foam) / <alpha-value>)',
          iris: 'rgb(var(--rp-iris) / <alpha-value>)',
          'highlight-low': 'rgb(var(--rp-highlight-low) / <alpha-value>)',
          'highlight-med': 'rgb(var(--rp-highlight-med) / <alpha-value>)',
          'highlight-high': 'rgb(var(--rp-highlight-high) / <alpha-value>)',
        },
        // Mapped color scales to align standard Tailwind classes with Rosé Pine / Rosé Pine Dawn
        gray: {
          50: '#faf4ed',   // Dawn base
          100: '#f2e9e1',  // Dawn overlay
          200: '#dfdad9',  // Dawn highlight med
          300: '#cecacd',  // Dawn highlight high
          400: '#9893a5',  // Dawn muted
          500: '#797593',  // Dawn subtle
          600: '#575279',  // Dawn text
          700: '#403d52',  // Dark highlight med
          800: '#26233a',  // Dark overlay
          900: '#191724',  // Dark base
          950: '#13111c',  // Deep base
        },
        sky: {
          50: '#f2f8fa',
          100: '#e1f0f4',
          200: '#c5e2eb',
          300: '#9ccfd8',  // Rosé Pine Foam
          400: '#56949f',  // Dawn Foam
          500: '#31748f',  // Rosé Pine Pine
          600: '#286983',  // Dawn Pine
          700: '#1f5368',
          800: '#193f4f',
          900: '#142d38',
        },
        emerald: {
          50: '#f2f8fa',
          100: '#e1f0f4',
          400: '#9ccfd8',
          500: '#56949f',
          600: '#286983',
          700: '#31748f',
        },
        violet: {
          50: '#fbf8fc',
          100: '#f4edf8',
          400: '#c4a7e7',  // Rosé Pine Iris
          500: '#907aa9',  // Dawn Iris
          600: '#907aa9',
          700: '#7b6594',
        },
        amber: {
          50: '#fdf9f2',
          100: '#fbf1e2',
          400: '#f6c177',  // Rosé Pine Gold
          500: '#ea9d34',  // Dawn Gold
          600: '#c78426',
        },
        red: {
          50: '#fdf3f5',
          100: '#f9e4e9',
          400: '#eb6f92',  // Rosé Pine Love
          500: '#b4637a',  // Dawn Love
          600: '#994e63',
        },
      }
    },
  },
  plugins: [],
}
