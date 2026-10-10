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
        // gurukul.org palette — read off the live events page
        gk: {
          primary: "#cc0000",
          primaryDark: "#a00000",
          primaryDeep: "#91191c",
          default: "#212529",
          text: "#333333",
          light: "#fcfcfd",
          secondary: "#eff2f6",
          line: "#d5d5d5",
          border: "#dddddd",
          muted: "#6c757d",
          field: "#f9f9f9",
        },
        gurukul: {
          saffron: {
            50: "#fff5f5",
            100: "#ffe3e3",
            200: "#ffc9c9",
            300: "#ffa8a8",
            400: "#ff8787",
            500: "#cc0000",
            600: "#a00000",
            700: "#800000",
            800: "#660000",
            900: "#4d0000",
          },
          navy: {
            50: "#eff2f6",
            100: "#dee2e6",
            200: "#ced4da",
            300: "#adb5bd",
            400: "#868e96",
            500: "#495057",
            600: "#343a40",
            700: "#212529",
            800: "#1a1d20",
            900: "#0f0f0f",
            950: "#000000",
          },
        },
      },
      fontFamily: {
        sans: [
          "BentonSans",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        title: ["zapf-humanist-bt", "Optima", "Palatino Linotype", "Candara", "sans-serif"],
        display: ["zapf-humanist-bt", "Optima", "Palatino Linotype", "Candara", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      maxWidth: {
        container: "1140px",
      },
      boxShadow: {
        soft: "0 4px 20px -2px rgba(0, 0, 0, 0.04)",
        card: "0 0 26px rgba(0, 0, 0, 0.12)",
        "card-hover": "0 0 26px rgba(0, 0, 0, 0.25)",
        logo: "0 0 26px rgba(0, 0, 0, 0.25)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
