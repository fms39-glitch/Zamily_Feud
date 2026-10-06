"use client";

import { useEffect, useRef } from "react";

export interface ConfettiBurst {
  /** Origin, as a fraction of the viewport (0-1). */
  x: number;
  y: number;
  count: number;
  /** Launch direction in degrees (0 = right, -90 = up) and spread around it. */
  angle: number;
  spread: number;
  speed: number;
  /** Seconds after mount to fire. */
  delay?: number;
  colors: string[];
  shape?: "ribbon" | "spark";
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  life: number;
  shape: "ribbon" | "spark";
  bornAt: number;
}

const GRAVITY = 900; // px/s²
const DRAG = 0.985;
const LIFETIME = 3.2; // s

/** A dependency-free canvas confetti layer: fires the given bursts once, then clears itself. */
export default function Confetti({ bursts }: { bursts: ConfettiBurst[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: Particle[] = [];
    const start = performance.now();
    for (const b of bursts) {
      const n = reduce ? Math.ceil(b.count / 6) : b.count;
      for (let i = 0; i < n; i++) {
        const a = ((b.angle + (Math.random() - 0.5) * b.spread) * Math.PI) / 180;
        const v = b.speed * (0.55 + Math.random() * 0.6);
        const shape = b.shape ?? "ribbon";
        particles.push({
          x: b.x * window.innerWidth,
          y: b.y * window.innerHeight,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 14,
          w: shape === "spark" ? 3 : 7 + Math.random() * 6,
          h: shape === "spark" ? 3 : 4 + Math.random() * 5,
          color: b.colors[i % b.colors.length],
          life: LIFETIME * (0.7 + Math.random() * 0.3),
          shape,
          bornAt: start + (b.delay ?? 0) * 1000,
        });
      }
    }

    let raf = 0;
    let last = start;
    const frame = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      g.clearRect(0, 0, window.innerWidth, window.innerHeight);
      let alive = 0;
      for (const p of particles) {
        if (now < p.bornAt) {
          alive++;
          continue;
        }
        const age = (now - p.bornAt) / 1000;
        if (age > p.life) continue;
        alive++;
        p.vx *= DRAG;
        p.vy = p.vy * DRAG + GRAVITY * dt * (p.shape === "spark" ? 0.35 : 1);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        g.save();
        g.globalAlpha = Math.max(0, 1 - age / p.life);
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = p.color;
        if (p.shape === "spark") {
          g.shadowColor = p.color;
          g.shadowBlur = 8;
          g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        } else {
          // Squash the ribbon horizontally as it spins, for a cheap 3D flutter.
          g.scale(Math.cos(p.rot * 1.7), 1);
          g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        g.restore();
      }
      if (alive > 0) raf = requestAnimationFrame(frame);
      else g.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [bursts]);

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[60] h-full w-full" aria-hidden />;
}

export const GOLD = ["#f4c430", "#ffe27a", "#fff6c9", "#d9a812", "#ffffff"];
export const SILVER = ["#f8fafc", "#cbd5e1", "#94a3b8", "#e2e8f0", "#ffffff"];
export const BRONZE = ["#e0995e", "#f3c49b", "#b8733a", "#ffd9b8"];
export const FESTIVE = ["#f4c430", "#38bdf8", "#fb7185", "#a78bfa", "#34d399", "#ffffff"];
