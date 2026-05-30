import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#192330",
        panel: "#f8fafc",
        border: "#e5e7eb",
        accent: "#ff5722",
        positive: "#0f9d58",
        negative: "#d64b4b",
        muted: "#66768a",
      },
      boxShadow: {
        panel: "0 12px 30px rgba(15, 23, 42, 0.06)",
      },
      fontFamily: {
        sans: ["Inter", "Avenir Next", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
