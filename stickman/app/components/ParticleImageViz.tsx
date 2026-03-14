"use client";

import { memo, useEffect, useRef, useCallback } from "react";

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

const IMAGE_SRC = "/images/bt4-clean.png";
const DENSITY = 220;
const PARTICLE_SIZE = 1.0;
const PARTICLE_SPEED = 1;
const ATTRACT_DISTANCE = 120;
const ATTRACT_STRENGTH = 80;
const CANVAS_PCT = 80;
const RESTLESS = 5;

function randColor(): string {
  const palettes = [
    "#c8d8ff", "#a0b8f0", "#8090dd", "#b0a0e8", "#d0c8ff",
    "#ffb8c0", "#ffd0a0", "#ffe0b0",
    "#ffffff", "#e8e8f0", "#d0d4e0",
  ];
  return palettes[Math.floor(Math.random() * palettes.length)];
}

interface ParticleImageVizProps {
  pointerRef: React.RefObject<{ x: number; y: number }>;
}

export const ParticleImageViz = memo(function ParticleImageViz({
  pointerRef,
}: ParticleImageVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const animRef = useRef<number>(0);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const imageLoadedRef = useRef(false);
  const imgBounds = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const loadParticlesFromImage = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !imageLoadedRef.current) return;

    const ctx = canvas.getContext("2d")!;
    const w = sizeRef.current.w;
    const h = sizeRef.current.h;
    if (w === 0 || h === 0) return;

    const imgAspect = img.naturalWidth / img.naturalHeight;
    const canvasAspect = w / h;
    let drawW: number, drawH: number;
    if (imgAspect < canvasAspect) {
      drawH = Math.min(Math.round((h * CANVAS_PCT) / 100), h - 20);
      drawW = Math.round(drawH * imgAspect);
    } else {
      drawW = Math.min(Math.round((w * CANVAS_PCT) / 100), w - 20);
      drawH = Math.round(drawW / imgAspect);
    }
    const drawX = Math.round(w / 2 - drawW / 2);
    const drawY = Math.round(h / 2 - drawH / 2);
    imgBounds.current = { x: drawX, y: drawY, w: drawW, h: drawH };

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    const pixelData = ctx.getImageData(drawX, drawY, drawW, drawH);
    ctx.clearRect(0, 0, w, h);

    const newDests: { x: number; y: number }[] = [];
    const inc = Math.max(1, Math.round(drawW / DENSITY));
    for (let i = 0; i < drawW; i += inc) {
      for (let j = 0; j < drawH; j += inc) {
        if (pixelData.data[(i + j * drawW) * 4 + 3] > 128) {
          newDests.push({ x: drawX + i, y: drawY + j });
        }
      }
    }

    const existing = particlesRef.current;

    if (existing.length === 0) {
      // First load: scatter particles randomly, they'll animate to destinations
      particlesRef.current = newDests.map((d) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        destX: d.x,
        destY: d.y,
        vx: (Math.random() - 0.5) * PARTICLE_SPEED,
        vy: (Math.random() - 0.5) * PARTICLE_SPEED,
        friction: Math.random() * 0.01 + 0.92,
        color: randColor(),
        radius: PARTICLE_SIZE * (0.4 + Math.random() * 0.6),
      }));
    } else {
      // Retarget existing particles (for resize)
      const next: Particle[] = [];
      for (let i = 0; i < newDests.length; i++) {
        if (i < existing.length) {
          existing[i].destX = newDests[i].x;
          existing[i].destY = newDests[i].y;
          next.push(existing[i]);
        } else {
          const src = existing[Math.floor(Math.random() * existing.length)];
          next.push({
            x: src.x,
            y: src.y,
            destX: newDests[i].x,
            destY: newDests[i].y,
            vx: (Math.random() - 0.5) * PARTICLE_SPEED,
            vy: (Math.random() - 0.5) * PARTICLE_SPEED,
            friction: Math.random() * 0.01 + 0.92,
            color: randColor(),
            radius: PARTICLE_SIZE * (0.4 + Math.random() * 0.6),
          });
        }
      }
      particlesRef.current = next;
    }
  }, []);

  // Preload image once
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      imageLoadedRef.current = true;
      // If canvas is already sized, load particles now
      loadParticlesFromImage();
    };
    img.src = IMAGE_SRC;
  }, [loadParticlesFromImage]);

  // Canvas resize + animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;

    const buildBg = (w: number, h: number) => {
      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      const bgCtx = offscreen.getContext("2d")!;

      const grad = bgCtx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0a0618");
      grad.addColorStop(0.25, "#1a0a3a");
      grad.addColorStop(0.5, "#2a1050");
      grad.addColorStop(0.75, "#1e0d40");
      grad.addColorStop(1, "#0c0820");
      bgCtx.fillStyle = grad;
      bgCtx.fillRect(0, 0, w, h);

      const starCount = Math.round((w * h) / 1200);
      for (let i = 0; i < starCount; i++) {
        const sx = Math.random() * w;
        const sy = Math.random() * h;
        const sr = Math.random() * 1.3;
        const alpha = 0.2 + Math.random() * 0.6;
        const temp = Math.random();
        const col =
          temp < 0.6
            ? `rgba(255,255,255,${alpha})`
            : temp < 0.8
              ? `rgba(200,210,255,${alpha})`
              : `rgba(255,220,200,${alpha})`;
        bgCtx.fillStyle = col;
        bgCtx.beginPath();
        bgCtx.arc(sx, sy, sr, 0, Math.PI * 2);
        bgCtx.fill();
      }

      bgRef.current = offscreen;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = rect.width;
      canvas.height = rect.height;
      buildBg(rect.width, rect.height);
      // Re-create particles with new dimensions
      loadParticlesFromImage();
    };

    const animate = () => {
      const { w, h } = sizeRef.current;

      if (bgRef.current) {
        ctx.drawImage(bgRef.current, 0, 0);
      } else {
        ctx.clearRect(0, 0, w, h);
      }

      // Constrain pointer to image bounds (with small padding)
      const ib = imgBounds.current;
      const norm = pointerRef.current;
      const pad = Math.max(ib.w, ib.h) * 0.15;
      const mx = ib.x + ib.w / 2 + norm.x * (ib.w / 2 + pad);
      const my = ib.y + ib.h / 2 + norm.y * (ib.h / 2 + pad);

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

        // Attract (suck in) toward pointer
        const dmx = mx - p.x;
        const dmy = my - p.y;
        const mouseDist = Math.sqrt(dmx * dmx + dmy * dmy);
        if (mouseDist < ATTRACT_DISTANCE && mouseDist > 1) {
          const invStr = Math.max(300 - ATTRACT_STRENGTH, 10);
          const force = (ATTRACT_DISTANCE - mouseDist) / invStr;
          // Pull toward pointer (+ slight spiral via angular offset)
          const angle = Math.atan2(dmy, dmx) + (Math.random() - 0.5) * 0.6;
          p.vx += Math.cos(angle) * force;
          p.vy += Math.sin(angle) * force;
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
    animate();

    const obs = new ResizeObserver(resize);
    obs.observe(canvas);

    return () => {
      cancelAnimationFrame(animRef.current);
      obs.disconnect();
    };
  }, [pointerRef, loadParticlesFromImage]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ background: "#0a0618" }}
    />
  );
});
