import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-sunken": "var(--surface-sunken)",
        "surface-glass": "var(--surface-glass)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        text: "var(--text)",
        "text-muted": "var(--text-muted)",
        "text-subtle": "var(--text-subtle)",
        accent: "var(--accent)",
        "accent-fg": "var(--accent-fg)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
      },
      borderColor: {
        DEFAULT: "var(--border)",
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.04)",
        md: "0 4px 16px rgba(0,0,0,0.06)",
      },
      fontFamily: {
        sans: ["'Inter Variable'", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono Variable'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: {
        h1: "-0.025em",
        h2: "-0.015em",
      },
      maxWidth: {
        container: "1120px",
        prose: "640px",
      },
    },
  },
  plugins: [],
};

export default config;
