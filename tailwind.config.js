/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./AtlasPage.tsx",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./routes/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./utils/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "app-bg": "rgb(var(--app-bg) / <alpha-value>)",
        "app-surface": "rgb(var(--app-surface) / <alpha-value>)",
        "app-surface-alt": "rgb(var(--app-surface-alt) / <alpha-value>)",
        "app-border": "rgb(var(--app-border) / <alpha-value>)",
        "app-text": "rgb(var(--app-text) / <alpha-value>)",
        "app-muted": "rgb(var(--app-muted) / <alpha-value>)",
        "app-accent": "rgb(var(--app-accent) / <alpha-value>)",
        "app-info": "rgb(var(--app-info) / <alpha-value>)",
        "app-warning": "rgb(var(--app-warning) / <alpha-value>)",
        "app-danger": "rgb(var(--app-danger) / <alpha-value>)",
        "app-success": "rgb(var(--app-success) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Public Sans", "Segoe UI", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
}
