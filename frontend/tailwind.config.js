/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Kafi website maroon/red (sidebar brand)
        brand: {
          50: '#fdf2f2',
          100: '#fce4e4',
          200: '#f9c5c5',
          300: '#f39a9a',
          400: '#e85d5d',
          500: '#d63030',
          600: '#b91c1c',
          700: '#991b1b',
          800: '#7f1d1d',
          900: '#6b1515',
          950: '#4a0a0a',
        },
        // Logo wheat gold — accents & highlights
        gold: {
          50: '#fdf9ef',
          100: '#faf0d4',
          200: '#f5e0a8',
          300: '#e8c96a',
          400: '#d4af37',
          500: '#c9a227',
          600: '#b8941f',
          700: '#9a7a1a',
          800: '#7d6218',
          900: '#654f16',
        },
        kafi: {
          50: '#faf8f3',
          100: '#f4f0e6',
          200: '#e8e0cc',
          300: '#dcceb3',
          400: '#d1bc99',
          500: '#c5aa80',
          600: '#b89966',
          700: '#aa874d',
          800: '#9c7533',
          900: '#8e631a',
        },
        essence: {
          50: '#fef5e7',
          100: '#fdeacf',
          200: '#fad59e',
          300: '#f7c06e',
          400: '#f5ab3d',
          500: '#f2960d',
          600: '#d9800a',
          700: '#bf6a08',
          800: '#a65406',
          900: '#8c3e04',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
