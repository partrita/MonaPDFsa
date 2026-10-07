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
        rose: {
          50: '#fffaf8',
          100: '#fbf0ec',
          200: '#f6dfd8',
          300: '#ecc4bb',
          400: '#ebbcba',  // Rosé Pine Rose
          500: '#d7827e',  // Dawn Rose
          600: '#be6b67',
          700: '#a35451',
          800: '#85413f',
          900: '#683130',
        },
        pine: {
          50: '#f2f8fa',
          100: '#e1f0f4',
          200: '#c5e2eb',
          300: '#86b7c9',
          400: '#31748f',  // Rosé Pine Pine
          500: '#286983',  // Dawn Pine
          600: '#1f5368',
          700: '#193f4f',
          800: '#142d38',
          900: '#0e2028',
        },
        foam: {
          50: '#f3f9f9',
          100: '#e2f2f3',
          200: '#c4e4e6',
          300: '#9ccfd8',  // Rosé Pine Foam
          400: '#56949f',  // Dawn Foam
          500: '#3f7c87',
          600: '#2f626c',
          700: '#234a52',
          800: '#173339',
          900: '#0e2125',
        },
        iris: {
          50: '#fbf8fc',
          100: '#f4edf8',
          200: '#e7d8f0',
          300: '#c4a7e7',  // Rosé Pine Iris
          400: '#a890c2',
          500: '#907aa9',  // Dawn Iris
          600: '#7b6594',
          700: '#645179',
          800: '#4d3d5e',
          900: '#382b45',
        },
        gold: {
          50: '#fdf9f2',
          100: '#fbf1e2',
          200: '#f6dfbe',
          300: '#f6c177',  // Rosé Pine Gold
          400: '#ea9d34',  // Dawn Gold
          500: '#d18621',
          600: '#b06c13',
          700: '#8f560e',
          800: '#6e410a',
        },
        love: {
          50: '#fdf3f5',
          100: '#f9e4e9',
          200: '#f4c6d1',
          300: '#eb6f92',  // Rosé Pine Love
          400: '#cc577b',
          500: '#b4637a',  // Dawn Love
          600: '#994e63',
          700: '#7f3c4e',
          800: '#642c3b',
        },
      }
    },
  },
  plugins: [],
}
