import type { Config } from "tailwindcss";

/**
 * Tailwind config v2 — Content Automation Hub Redesign
 *
 * Palette: Blue 600 (primary) + Emerald 500 (accent)
 * Mood: Playful & Friendly — bo tròn nhiều, moderate motion
 * Mode: Light-only (darkMode removed)
 * Density: 6/10
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border:     "hsl(var(--border) / <alpha-value>)",
        input:      "hsl(var(--input) / <alpha-value>)",
        ring:       "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        card: {
          DEFAULT:    "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT:    "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          muted:      "hsl(var(--primary-muted) / <alpha-value>)",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          muted:      "hsl(var(--accent-muted) / <alpha-value>)",
        },
        success: {
          DEFAULT:    "hsl(var(--success) / <alpha-value>)",
          foreground: "hsl(var(--success-foreground) / <alpha-value>)",
          muted:      "hsl(var(--success-muted) / <alpha-value>)",
        },
        warning: {
          DEFAULT:    "hsl(var(--warning) / <alpha-value>)",
          foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
          muted:      "hsl(var(--warning-muted) / <alpha-value>)",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          muted:      "hsl(var(--destructive-muted) / <alpha-value>)",
        },
        info: {
          DEFAULT:    "hsl(var(--info) / <alpha-value>)",
          foreground: "hsl(var(--info-foreground) / <alpha-value>)",
          muted:      "hsl(var(--info-muted) / <alpha-value>)",
        },
        chart: {
          1:    "hsl(var(--chart-1) / <alpha-value>)",
          2:    "hsl(var(--chart-2) / <alpha-value>)",
          3:    "hsl(var(--chart-3) / <alpha-value>)",
          4:    "hsl(var(--chart-4) / <alpha-value>)",
          5:    "hsl(var(--chart-5) / <alpha-value>)",
          grid: "hsl(var(--chart-grid) / <alpha-value>)",
        },
      },
      fontFamily: {
        // next/font injects --font-sans (Outfit) and --font-mono (Fira Code)
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],  // 11px — badges, captions
      },
      borderRadius: {
        sm:      "var(--radius-sm)",    // 6px
        DEFAULT: "var(--radius)",       // 10px
        md:      "var(--radius)",       // 10px
        lg:      "var(--radius-lg)",    // 14px
        xl:      "var(--radius-xl)",    // 20px
      },
      boxShadow: {
        sm:      "var(--shadow-sm)",
        DEFAULT: "var(--shadow-md)",
        md:      "var(--shadow-md)",
        lg:      "var(--shadow-lg)",
      },
      spacing: {
        // Sidebar widths referenced by shell + content offsets
        rail:             "15rem",   // 240px — expanded
        "rail-collapsed": "4rem",    // 64px  — icon-only
      },
      keyframes: {
        // Entry animation — moderate (motion 5/10)
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to:   { opacity: "1", transform: "none" },
        },
        // Slide in from left (sidebar)
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to:   { opacity: "1", transform: "none" },
        },
        // Scale up (modal)
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to:   { opacity: "1", transform: "none" },
        },
        // Shimmer for skeletons
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        // Pulse glow for active indicators
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.5" },
        },
        // Accordion open/close
        "accordion-down": {
          from: { height: "0" },
          to:   { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to:   { height: "0" },
        },
      },
      animation: {
        "fade-in-up":     "fade-in-up 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-in-right": "slide-in-right 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "scale-in":       "scale-in 150ms cubic-bezier(0.16, 1, 0.3, 1) both",
        shimmer:          "shimmer 1.6s infinite",
        "pulse-soft":     "pulse-soft 2s ease-in-out infinite",
        "accordion-down": "accordion-down 200ms ease-out",
        "accordion-up":   "accordion-up 200ms ease-out",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
