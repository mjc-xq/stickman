"use client";

import { memo, useEffect, useRef, useState } from "react";

interface Particle {
  x: number;
  y: number;
  destX: number;
  destY: number;
  vx: number;
  vy: number;
  friction: number;
  color: string;
  radius: number;
}

const IMAGES = ["/images/bingo-t2-clean.png", "/images/bt3-clean.png", "/images/bt4-clean.png"];
const DENSITY = 160;
const PARTICLE_SIZE = 1.2;
const PARTICLE_SPEED = 1;
const REPULSE_DISTANCE = 60;
const REPULSE_STRENGTH = 80;
const CANVAS_PCT = 65;
const RESTLESS = 6;

interface ParticleImageVizProps {
  pointerRef: React.RefObject<{ x: number; y: number }>;
}

export const ParticleImageViz = memo(function ParticleImageViz({
  pointerRef,
}: ParticleImageVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgIndex, setImgIndex] = useState(0);
  const particlesRef = useRef<Particle[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const animRef = useRef<number>(0);

  // Load image and create/retarget particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const w = sizeRef.current.w;
    const h = sizeRef.current.h;
    if (w === 0 || h === 0) return;

    const img = new Image();
    img.onload = () => {
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const canvasAspect = w / h;
      let drawW: number, drawH: number;
      if (imgAspect < canvasAspect) {
        drawH = Math.round((h * CANVAS_PCT) / 100);
        drawW = Math.round(drawH * imgAspect);
      } else {
        drawW = Math.round((w * CANVAS_PCT) / 100);
        drawH = Math.round(drawW / imgAspect);
      }
      const drawX = Math.round(w / 2 - drawW / 2);
      const drawY = Math.round(h / 2 - drawH / 2);

      // Sample pixels
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      const pixelData = ctx.getImageData(drawX, drawY, drawW, drawH);
      ctx.clearRect(0, 0, w, h);

      // Build new destination list
      const newDests: { x: number; y: number }[] = [];
      const inc = Math.round(drawW / DENSITY);
      for (let i = 0; i < drawW; i += inc) {
        for (let j = 0; j < drawH; j += inc) {
          if (pixelData.data[(i + j * drawW) * 4 + 3] > 128) {
            newDests.push({ x: drawX + i, y: drawY + j });
          }
        }
      }

      const existing = particlesRef.current;
      const colors = ["#ffffff", "#d0d8ff", "#a0b0e0", "#c0c8ff"];

      if (existing.length === 0) {
        // First load: scatter from random positions
        particlesRef.current = newDests.map((d) => ({
          x: Math.random() * w,
          y: Math.random() * h,
          destX: d.x,
          destY: d.y,
          vx: (Math.random() - 0.5) * PARTICLE_SPEED,
          vy: (Math.random() - 0.5) * PARTICLE_SPEED,
          friction: Math.random() * 0.01 + 0.92,
          color: colors[Math.floor(Math.random() * colors.length)],
          radius: PARTICLE_SIZE * (0.5 + Math.random() * 0.5),
        }));
      } else {
        // Image switch: retarget existing particles to new destinations
        const next: Particle[] = [];
        for (let i = 0; i < newDests.length; i++) {
          if (i < existing.length) {
            // Reuse particle, just change destination
            existing[i].destX = newDests[i].x;
            existing[i].destY = newDests[i].y;
            next.push(existing[i]);
          } else {
            // Need more particles — spawn from a random existing one
            const src = existing[Math.floor(Math.random() * existing.length)];
            next.push({
              x: src.x,
              y: src.y,
              destX: newDests[i].x,
              destY: newDests[i].y,
              vx: (Math.random() - 0.5) * PARTICLE_SPEED,
              vy: (Math.random() - 0.5) * PARTICLE_SPEED,
              friction: Math.random() * 0.01 + 0.92,
              color: colors[Math.floor(Math.random() * colors.length)],
              radius: PARTICLE_SIZE * (0.5 + Math.random() * 0.5),
            });
          }
        }
        // Extra particles fly to random new dest or just get trimmed
        particlesRef.current = next;
      }
    };
    img.src = IMAGES[imgIndex];
  }, [imgIndex]);

  // Canvas resize + initial setup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    const animate = () => {
      const { w, h } = sizeRef.current;
      ctx.clearRect(0, 0, w, h);

      const norm = pointerRef.current;
      const mx = w / 2 + norm.x * w * 0.45;
      const my = h / 2 + norm.y * h * 0.45;

      for (const p of particlesRef.current) {
        const dx = p.destX - p.x;
        const dy = p.destY - p.y;
        const distToDest = Math.sqrt(dx * dx + dy * dy);

        if (distToDest < 3 && RESTLESS > 0) {
          p.x += (Math.random() - 0.5) * RESTLESS * 0.3;
          p.y += (Math.random() - 0.5) * RESTLESS * 0.3;
        }

        p.vx = (p.vx + dx / 500) * p.friction;
        p.vy = (p.vy + dy / 500) * p.friction;

        const dmx = p.x - mx;
        const dmy = p.y - my;
        const mouseDist = Math.sqrt(dmx * dmx + dmy * dmy);
        if (mouseDist < REPULSE_DISTANCE) {
          const invStr = Math.max(300 - REPULSE_STRENGTH, 10);
          p.vx += dmx / invStr;
          p.vy += dmy / invStr;
        }

        p.x += p.vx;
        p.y += p.vy;

        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    resize();
    // Trigger initial image load after resize sets dimensions
    setImgIndex((i) => i);

    animate();

    const obs = new ResizeObserver(resize);
    obs.observe(canvas);

    return () => {
      cancelAnimationFrame(animRef.current);
      obs.disconnect();
    };
  }, [pointerRef]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#050510" }}
        onClick={() => setImgIndex((i) => (i + 1) % IMAGES.length)}
      />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex gap-1.5 pointer-events-none">
        {IMAGES.map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === imgIndex ? "bg-blue-400" : "bg-zinc-600"
            }`}
          />
        ))}
      </div>
    </>
  );
});
