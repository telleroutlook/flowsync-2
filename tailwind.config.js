/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./shared/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    // Gantt chart task bar colors - must be explicitly safelisted
    'bg-success',
    'bg-warning',
    'bg-negative',
    'bg-primary',
    'border-success-dark',
    'border-warning-dark',
    'border-negative-dark',
    'border-primary-hover',
  ],
  theme: {
    extend: {
      colors: {
        background: '#F5F7FA', // Slightly cooler/modern gray
        surface: '#FFFFFF', 
        'surface-active': '#F0F2F5', // Added for hover states
        primary: {
          DEFAULT: '#0070F2', 
          hover: '#005AC2',
          foreground: '#FFFFFF'
        },
        secondary: {
          DEFAULT: '#556B82',
          foreground: '#FFFFFF'
        },
        accent: {
          DEFAULT: '#5D36FF', 
          hover: '#4B2BD0',
          foreground: '#FFFFFF'
        },
        text: {
          primary: '#1C2937', // Slightly softer black
          secondary: '#556B82',
        },
        border: {
          subtle: '#E2E8F0', // Lighter, cooler border
        },
        input: '#E2E8F0',
        ring: '#0070F2',
        joule: {
          start: '#5d36ff',
          end: '#a100c2',
        },
        success: {
          DEFAULT: '#256F3A',
          dark: '#1b502a',
          foreground: '#FFFFFF',
        },
        warning: {
          DEFAULT: '#E76500',
          dark: '#b54f00',
          foreground: '#FFFFFF',
        },
        critical: {
          DEFAULT: '#D93025',
          dark: '#a1231b',
          foreground: '#FFFFFF',
        },
        negative: {
          DEFAULT: '#D93025',
          dark: '#a1231b',
          foreground: '#FFFFFF',
        },
        error: {
          DEFAULT: '#D93025',
          foreground: '#FFFFFF',
        },
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'DEFAULT': '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        'md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        'float': '0 8px 30px rgba(0,0,0,0.08)', // Custom float shadow
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
