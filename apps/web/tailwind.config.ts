import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-anton)", "sans-serif"],
        heading: ["var(--font-bebas)", "sans-serif"],
      },
      colors: {
        navy: {
          950: "#050b1f",
          900: "#0a1730",
          800: "#0f2352",
          700: "#173a7a",
          600: "#204c9c",
        },
        gold: {
          400: "#ffe27a",
          500: "#f4c430",
          600: "#d9a812",
        },
        silver: {
          300: "#f1f5f9",
          400: "#cbd5e1",
          500: "#94a3b8",
        },
        bronze: {
          300: "#f3c49b",
          400: "#e0995e",
          500: "#b8733a",
        },
      },
      keyframes: {
        "title-reveal": {
          "0%": { opacity: "0", transform: "scale(0.4) translateY(40px)", filter: "blur(12px)" },
          "60%": { opacity: "1", transform: "scale(1.05) translateY(0)", filter: "blur(0)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)", filter: "blur(0)" },
        },
        "lens-sweep": {
          "0%": { transform: "translateX(-120%) skewX(-20deg)", opacity: "0" },
          "15%": { opacity: "0.9" },
          "50%": { opacity: "0.9" },
          "100%": { transform: "translateX(220%) skewX(-20deg)", opacity: "0" },
        },
        "fade-out": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0", visibility: "hidden" },
        },
        "flip-reveal": {
          "0%": { transform: "rotateY(0deg)" },
          "100%": { transform: "rotateY(180deg)" },
        },
        "strike-pop": {
          "0%": { opacity: "0", transform: "scale(0.5) rotate(-8deg)" },
          "15%": { opacity: "1", transform: "scale(1.15) rotate(3deg)" },
          "30%": { transform: "scale(1) rotate(0deg)" },
          "85%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        "screen-shake": {
          "0%, 100%": { transform: "translate(0, 0)" },
          "20%": { transform: "translate(-10px, 4px)" },
          "40%": { transform: "translate(8px, -6px)" },
          "60%": { transform: "translate(-6px, 6px)" },
          "80%": { transform: "translate(6px, -3px)" },
        },
        "score-glow": {
          "0%, 100%": { textShadow: "0 0 10px rgba(244,196,48,0.6), 0 0 2px rgba(255,255,255,0.8)" },
          "50%": { textShadow: "0 0 22px rgba(244,196,48,0.95), 0 0 4px rgba(255,255,255,0.9)" },
        },
        "match-glow": {
          "0%": { boxShadow: "0 0 0 0 rgba(244,196,48,0)", transform: "scale(1)" },
          "30%": { boxShadow: "0 0 45px 12px rgba(244,196,48,0.85)", transform: "scale(1.06)" },
          "100%": { boxShadow: "0 0 0 0 rgba(244,196,48,0)", transform: "scale(1)" },
        },
        "buzzer-ready": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(244,196,48,0.55)" },
          "50%": { boxShadow: "0 0 0 14px rgba(244,196,48,0)" },
        },
        "banner-in": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // --- Celebrations & polish ---
        "sunburst-spin": {
          "0%": { transform: "rotate(0deg) scale(0.6)", opacity: "0" },
          "15%": { opacity: "1" },
          "100%": { transform: "rotate(160deg) scale(1.15)", opacity: "1" },
        },
        "stamp-in": {
          "0%": { transform: "scale(3) rotate(-14deg)", opacity: "0", filter: "blur(6px)" },
          "55%": { transform: "scale(0.92) rotate(-4deg)", opacity: "1", filter: "blur(0)" },
          "75%": { transform: "scale(1.06) rotate(-6deg)" },
          "100%": { transform: "scale(1) rotate(-5deg)", opacity: "1" },
        },
        "shine-sweep": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "ribbon-in": {
          "0%": { transform: "translateX(-120%) skewX(-12deg)", opacity: "0" },
          "60%": { transform: "translateX(6%) skewX(-12deg)", opacity: "1" },
          "100%": { transform: "translateX(0) skewX(-12deg)", opacity: "1" },
        },
        "beam-left": {
          "0%": { transform: "rotate(-55deg)", opacity: "0" },
          "20%": { opacity: "0.85" },
          "100%": { transform: "rotate(25deg)", opacity: "0.85" },
        },
        "beam-right": {
          "0%": { transform: "rotate(55deg)", opacity: "0" },
          "20%": { opacity: "0.85" },
          "100%": { transform: "rotate(-25deg)", opacity: "0.85" },
        },
        twinkle: {
          "0%, 100%": { transform: "scale(0) rotate(0deg)", opacity: "0" },
          "50%": { transform: "scale(1) rotate(90deg)", opacity: "1" },
        },
        "badge-pop": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "60%": { transform: "scale(1.25)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "fx-fade": {
          "0%": { opacity: "0" },
          "10%, 85%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        "float-up": {
          "0%": { transform: "translateY(8px) scale(0.8)", opacity: "0" },
          "20%": { transform: "translateY(0) scale(1.1)", opacity: "1" },
          "100%": { transform: "translateY(-44px) scale(1)", opacity: "0" },
        },
        "slam-in": {
          "0%": { transform: "translateY(-30px) scale(1.4)", opacity: "0" },
          "60%": { transform: "translateY(0) scale(0.97)", opacity: "1" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "marquee-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
        "spotlight-drift": {
          "0%, 100%": { transform: "translate(-8%, 0)" },
          "50%": { transform: "translate(8%, 4%)" },
        },
        "urgent-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(239,68,68,0.0)" },
          "50%": { boxShadow: "0 0 18px 4px rgba(239,68,68,0.55)" },
        },
        "rise-in": {
          "0%": { transform: "translateY(40px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "crown-bob": {
          "0%, 100%": { transform: "translateY(0) rotate(-8deg)" },
          "50%": { transform: "translateY(-3px) rotate(-4deg)" },
        },
        "tile-shimmer": {
          "0%": { transform: "translateX(-150%) skewX(-20deg)" },
          "100%": { transform: "translateX(250%) skewX(-20deg)" },
        },
      },
      animation: {
        "title-reveal": "title-reveal 1.4s cubic-bezier(0.16,1,0.3,1) forwards",
        "lens-sweep": "lens-sweep 2.2s ease-in-out forwards",
        "fade-out": "fade-out 0.6s ease-in forwards",
        "flip-reveal": "flip-reveal 0.6s cubic-bezier(0.45,0,0.55,1) forwards",
        "strike-pop": "strike-pop 1.4s ease-out forwards",
        "screen-shake": "screen-shake 0.5s ease-in-out",
        "score-glow": "score-glow 2s ease-in-out infinite",
        "match-glow": "match-glow 900ms ease-out",
        "buzzer-ready": "buzzer-ready 1.6s ease-out infinite",
        "banner-in": "banner-in 250ms ease-out",
        "sunburst-spin": "sunburst-spin 3.2s cubic-bezier(0.16,1,0.3,1) forwards",
        "stamp-in": "stamp-in 700ms cubic-bezier(0.2,0.9,0.3,1.2) forwards",
        "shine-sweep": "shine-sweep 1.6s linear infinite",
        "ribbon-in": "ribbon-in 600ms cubic-bezier(0.2,0.9,0.3,1.1) forwards",
        "beam-left": "beam-left 2.4s ease-in-out forwards",
        "beam-right": "beam-right 2.4s ease-in-out forwards",
        twinkle: "twinkle 1.2s ease-in-out infinite",
        "badge-pop": "badge-pop 450ms cubic-bezier(0.2,0.9,0.3,1.4) forwards",
        "fx-fade": "fx-fade 3.2s ease-in-out forwards",
        "float-up": "float-up 1.4s ease-out forwards",
        "slam-in": "slam-in 450ms cubic-bezier(0.2,0.9,0.3,1.2) forwards",
        "marquee-blink": "marquee-blink 0.9s steps(1) infinite",
        "spotlight-drift": "spotlight-drift 14s ease-in-out infinite",
        "urgent-pulse": "urgent-pulse 0.8s ease-in-out infinite",
        "rise-in": "rise-in 700ms cubic-bezier(0.16,1,0.3,1) both",
        "crown-bob": "crown-bob 2s ease-in-out infinite",
        "tile-shimmer": "tile-shimmer 2.8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
