import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Phaser-inspired brand: hot pink / magenta
        primary: {
          DEFAULT: "#ff2d75",
          foreground: "#ffffff",
          50: "#fff0f5",
          100: "#ffe0eb",
          200: "#ffc2d8",
          300: "#ff94b8",
          400: "#ff5c93",
          500: "#ff2d75",
          600: "#e60a5c",
          700: "#c00049",
          800: "#990039",
        },
        // secondary accent: cyan (PhaserPunk neon)
        accent: {
          DEFAULT: "#22d3ee",
          400: "#22d3ee",
          500: "#06b6d4",
        },
        surface: {
          DEFAULT: "#1c1830",
          50: "#272138",
          100: "#332b48",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: { from: { transform: "translateY(8px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
      },
    },
  },
  plugins: [],
};

export default config;
