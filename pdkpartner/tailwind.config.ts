import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sidebar: {
          bg: "#1a2233",
          hover: "#243044",
          active: "#2d3c56",
          border: "#253047",
          text: "#8fa3c0",
          "text-active": "#ffffff",
        },
        brand: {
          DEFAULT: "#0066cc",
          light: "#e8f0fe",
        },
      },
    },
  },
  plugins: [],
};
export default config;
