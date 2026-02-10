import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        dd: {
          red: "#FF3008",
          "red-hover": "#E02800",
          "red-active": "#B71000",
          "red-light": "#FFF0ED",
          "red-lighter": "#FFE0D6",
          black: "#191919",
          950: "#191919",
          900: "#2D2D2D",
          800: "#494949",
          700: "#5E5E5E",
          600: "#767676",
          500: "#999999",
          400: "#BBBBBB",
          300: "#E0E0E0",
          200: "#EBEBEB",
          100: "#F5F5F5",
          50: "#FAFAFA",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
      borderRadius: {
        dd: "12px",
        "dd-pill": "24px",
      },
      boxShadow: {
        "dd-sm": "0 1px 2px rgba(0,0,0,0.06)",
        "dd-md": "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
        "dd-lg": "0 4px 12px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
