import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // 1440p and 4K-at-150% monitors report ~2560px, so widen layouts there instead of centring a 1200px column
      screens: {
        '3xl': '1800px',
        '4xl': '2400px',
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        'jagr-blue': '#4A8BCC',
        'jagr-dark-blue': '#1F2745',
        // Centre Ice palette
        ice: '#F4F8FB',
        ink: {
          DEFAULT: '#12182E',
          soft: '#3A4560',
          muted: '#56627A',
          faint: '#6B778E',
        },
        line: {
          DEFAULT: '#DCE5EE',
          soft: '#E6EDF4',
          strong: '#C9D6E3',
        },
        rink: {
          blue: '#1F6FC2',
          line: '#3D8BDA',
          red: '#C8102E',
          wash: '#EAF2FA',
        },
        gold: {
          light: '#F0C75E',
          DEFAULT: '#B8860B',
          deep: '#8A6410',
          tint: '#FFF3CC',
        },
        award: {
          single: '#FFF3CC',
          multi: '#FFE0E4',
        },
      },
      fontFamily: {
        sans: ['var(--font-archivo)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 24px 48px -36px rgba(31, 39, 69, 0.35)',
      },
      maxWidth: {
        board: '780px',
        page: '1200px',
        'page-3xl': '1560px',
        'page-4xl': '1880px',
      },
    },
  },
  plugins: [],
} satisfies Config;
