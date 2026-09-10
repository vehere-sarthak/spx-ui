import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Helvetica Neue", "Arial", "sans-serif"],
        // Sans-only product: `font-serif` resolves to DM Sans rather than
        // falling back to Georgia now that no serif face is loaded.
        serif: ["var(--font-sans)", "Helvetica Neue", "Arial", "sans-serif"],
        // Single-typeface product: `font-mono` resolves to DM Sans too, so the
        // whole console is one face. Numeric alignment comes from
        // `tabular-nums`, not from a monospaced fallback.
        mono: ["var(--font-sans)", "Helvetica Neue", "Arial", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        severity: {
          critical: "#E11D2E",
          high: "#F97316",
          medium: "#EAB308",
          low: "#3B82F6",
          info: "#06B6D4",
          success: "#22C55E",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        orbit: {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.85)", opacity: "0.7" },
          "100%": { transform: "scale(1.35)", opacity: "0" },
        },
        "stream-in": {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "ticker": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        /* Loader: a ring lit from the inside, swept round by the rotation.
           The reds track --primary so the loader matches the console. */
        "loader-ring": {
          "0%": {
            transform: "rotate(90deg)",
            boxShadow:
              "0 6px 12px 0 #ff5b6e inset, 0 12px 18px 0 #e11d2e inset, 0 36px 36px 0 #7f1020 inset, 0 0 3px 1.2px rgba(255,91,110,0.3), 0 0 6px 1.8px rgba(225,29,46,0.2)",
          },
          "50%": {
            transform: "rotate(270deg)",
            boxShadow:
              "0 6px 12px 0 #ff8090 inset, 0 12px 6px 0 #c81028 inset, 0 24px 36px 0 #e11d2e inset, 0 0 3px 1.2px rgba(255,91,110,0.3), 0 0 6px 1.8px rgba(225,29,46,0.2)",
          },
          "100%": {
            transform: "rotate(450deg)",
            boxShadow:
              "0 6px 12px 0 #ff6b7d inset, 0 12px 18px 0 #e11d2e inset, 0 36px 36px 0 #7f1020 inset, 0 0 3px 1.2px rgba(255,91,110,0.3), 0 0 6px 1.8px rgba(225,29,46,0.2)",
          },
        },
        "loader-letter": {
          "0%, 100%": { opacity: "0.4", transform: "translateY(0)" },
          "20%": { opacity: "1", transform: "scale(1.15)" },
          "40%": { opacity: "0.7", transform: "translateY(0)" },
        },
        /* Dashes travelling along a stroke, in the path's own direction.
           The offset counts down one full dash period, so it loops seamlessly. */
        "flow-in": {
          from: { strokeDashoffset: "12" },
          to: { strokeDashoffset: "0" },
        },
        /* The matcher's ring, crawling to show it is live. */
        "ring-crawl": {
          from: { strokeDashoffset: "0" },
          to: { strokeDashoffset: "16" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        orbit: "orbit 48s linear infinite",
        "pulse-ring": "pulse-ring 2.2s cubic-bezier(0.16,1,0.3,1) infinite",
        "stream-in": "stream-in 0.35s ease-out",
        ticker: "ticker 40s linear infinite",
        "loader-ring": "loader-ring 5s linear infinite",
        "loader-letter": "loader-letter 3s infinite",
        "flow-in": "flow-in 1.6s linear infinite",
        "ring-crawl": "ring-crawl 3s linear infinite",
      },
      boxShadow: {
        /* Selection reads as a crisp ring, not a bloom — no ambient glow anywhere. */
        crimson: "0 0 0 1px rgba(225,29,46,0.45)",
        panel: "0 1px 2px rgba(0,0,0,0.10), 0 10px 24px -18px rgba(0,0,0,0.55)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
