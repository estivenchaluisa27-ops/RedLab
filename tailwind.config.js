/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.js'],
  theme: {
    extend: {
      colors: {
        uce: {
          50: '#eef6fc',
          100: '#d9ebf8',
          200: '#b5d7f0',
          300: '#7ab6e2',
          400: '#3d8fd0',
          500: '#0a67b3',
          600: '#00538f',
          700: '#004274',
          800: '#003366',
          900: '#002244',
          950: '#001a33',
        },
        gold: {
          400: '#f0c44e',
          500: '#e1ad01',
          600: '#c99500',
        },
      },
      fontFamily: {
        display: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,34,68,0.06), 0 8px 24px -12px rgba(0,66,116,0.18)',
        'card-hover': '0 2px 4px rgba(0,34,68,0.08), 0 16px 40px -16px rgba(0,66,116,0.30)',
        modal: '0 0 0 1px rgba(0,34,68,0.05), 0 25px 60px -15px rgba(0,34,68,0.40)',
        glow: '0 8px 30px -6px rgba(0,66,116,0.35)',
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
