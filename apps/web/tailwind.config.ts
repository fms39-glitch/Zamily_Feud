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
      },
      animation: {
        "title-reveal": "title-reveal 1.4s cubic-bezier(0.16,1,0.3,1) forwards",
        "lens-sweep": "lens-sweep 2.2s ease-in-out forwards",
        "fade-out": "fade-out 0.6s ease-in forwards",
        "flip-reveal": "flip-reveal 0.6s cubic-bezier(0.45,0,0.55,1) forwards",
        "strike-pop": "strike-pop 1.4s ease-out forwards",
        "screen-shake": "screen-shake 0.5s ease-in-out",
        "score-glow": "score-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
