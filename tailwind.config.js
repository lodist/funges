/** @type {import('tailwindcss').Config} */
//
// NOT READ BY TAILWIND. This project runs Tailwind v4, which only loads a JS
// config when a stylesheet declares `@config` — and none does. The theme lives in
// src/index.css under `@theme`, and the dark variant comes from `@custom-variant`
// there, not from `darkMode` below.
//
// Kept because components.json points the shadcn CLI at it. Do not add theme
// values here expecting them to work: three components used `bg-status-warning`
// and `text-primary-600` from this file and rendered nothing for it. Add colours
// to `@theme` in src/index.css instead.
//
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './src/**/*.stories.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      width: {
        sidebar: '80px',
      },

      height: {
        footer: '40px',
        header: '50px',
      },

      zIndex: {
        base: '0',
        overlay: '1000',
        splash: '2000',
      },

      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },

      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
