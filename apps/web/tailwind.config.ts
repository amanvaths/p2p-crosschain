import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Custom color palette - inspired by deep space and neon accents
        background: '#0a0a0f',
        surface: {
          DEFAULT: '#12121a',
          light: '#1a1a25',
          lighter: '#22222f',
        },
        primary: {
          DEFAULT: '#00d4aa',
          dark: '#00a888',
          light: '#33ddbb',
        },
        secondary: {
          DEFAULT: '#6366f1',
          dark: '#4f46e5',
          light: '#818cf8',
        },
        accent: {
          DEFAULT: '#f472b6',
          dark: '#ec4899',
          light: '#f9a8d4',
        },
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        muted: '#6b7280',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'gradient': 'gradient 8s linear infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'grid-pattern': `linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
                         linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px)`,
      },
      backgroundSize: {
        'grid': '64px 64px',
      },
    },
  },
  plugins: [],
};

export default config;

