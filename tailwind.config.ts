import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#191919',
        panel: '#242424',
        'panel-2': '#2b2b2b',
        'panel-3': '#323232',
        line: 'rgba(255,255,255,0.07)',
        'line-strong': 'rgba(255,255,255,0.12)',
        ink: '#f4f5f7',
        muted: '#9b9fa8',
        faint: '#6d7178',
        accent: '#4169F5',
        'accent-soft': 'rgba(65,105,245,0.14)',
        solar: '#FF944D',
        'solar-soft': 'rgba(255,148,77,0.14)',
        leaf: '#3FBF7F',
        'leaf-soft': 'rgba(63,191,127,0.14)',
        danger: '#F0564A',
        'danger-soft': 'rgba(240,86,74,0.14)',
        sky: '#38BDF8',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '16px',
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.03) inset, 0 10px 24px -12px rgba(0,0,0,0.55)',
        pop: '0 18px 44px -16px rgba(0,0,0,0.7)',
        glow: '0 0 0 1px rgba(65,105,245,0.35), 0 8px 30px -8px rgba(65,105,245,0.45)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        flow: {
          to: { strokeDashoffset: '-28' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease both',
        flow: 'flow 1.1s linear infinite',
        'pulse-soft': 'pulseSoft 2.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
