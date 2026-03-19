"use client";

import { useEffect, useRef, useState } from "react";
import { usePointer } from "@/app/hooks/stickman";

// Same particle system as ParticleImageViz but with birthday overlay
const IMAGE_SRC = "/images/bt4-clean.png";
const DENSITY = 220;
const PARTICLE_SIZE = 1.0;
const PARTICLE_SPEED = 1;
const ATTRACT_PCT = 0.15;
const ATTRACT_STRENGTH = 50;
const CANVAS_PCT = 80;
const RESTLESS = 5;

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

function randColor(): string {
  const palettes = [
    "#c8d8ff", "#a0b8f0", "#8090dd", "#b0a0e8", "#d0c8ff",
    "#ffb8c0", "#ffd0a0", "#ffe0b0",
    "#ffffff", "#e8e8f0", "#d0d4e0",
  ];
  return palettes[Math.floor(Math.random() * palettes.length)];
}

// Pre-computed sparkle positions (avoids hydration mismatch from Math.random in JSX)
const BIRTHDAY_SPARKLES = Array.from({ length: 12 }, (_, i) => ({
  size: 2 + ((i * 7 + 3) % 5) * 0.8,
  top: 10 + ((i * 31 + 17) % 80),
  left: 5 + ((i * 47 + 11) % 90),
  color: i % 3 === 0 ? "#ffd700" : i % 3 === 1 ? "#ff69b4" : "#ffffff",
  animDuration: 1 + ((i * 13 + 5) % 20) * 0.1,
  animDelay: ((i * 19 + 7) % 20) * 0.1,
  shadow: 4 + ((i * 11 + 3) % 8),
}));

interface BirthdayFinaleProps {
  isActive: boolean;
}

export function BirthdayFinale({ isActive }: BirthdayFinaleProps) {
  const pointer = usePointer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isActiveRef = useRef(isActive);
  const [textVisible, setTextVisible] = useState(false);

  // Keep ref in sync
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  // Show birthday text with delay when active
  useEffect(() => {
    if (isActive) {
      const t = setTimeout(() => setTextVisible(true), 600);
      return () => clearTimeout(t);
    } else {
      setTextVisible(false);
    }
  }, [isActive]);

  // Particle animation (same as ParticleImageViz, but only runs when active)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    let animId = 0;
    let particles: Particle[] = [];
    let bgCanvas: HTMLCanvasElement | null = null;
    let imgBounds = { x: 0, y: 0, w: 0, h: 0 };
    let size = { w: 0, h: 0 };
    let imageLoaded = false;
    let loadedImg: HTMLImageElement | null = null;

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
        bgCtx.fillStyle = temp < 0.6 ? `rgba(255,255,255,${alpha})`
          : temp < 0.8 ? `rgba(200,210,255,${alpha})` : `rgba(255,220,200,${alpha})`;
        bgCtx.beginPath();
        bgCtx.arc(sx, sy, sr, 0, Math.PI * 2);
        bgCtx.fill();
      }
      bgCanvas = offscreen;
    };

    const createParticles = () => {
      if (!loadedImg || !imageLoaded || size.w === 0 || size.h === 0) return;
      const { w, h } = size;
      const imgAspect = loadedImg.naturalWidth / loadedImg.naturalHeight;
      const canvasAspect = w / h;
      let drawW: number, drawH: number;
      if (imgAspect < canvasAspect) {
        drawH = Math.min(Math.round((h * CANVAS_PCT) / 100), h - 20);
        drawW = Math.round(drawH * imgAspect);
      } else {
        drawW = Math.min(Math.round((w * CANVAS_PCT) / 100), w - 20);
        drawH = Math.round(drawW / imgAspect);
      }
      // Shift image down a bit to leave room for birthday text
      const drawX = Math.round(w / 2 - drawW / 2);
      const drawY = Math.round(h / 2 - drawH / 2) + Math.round(h * 0.05);
      imgBounds = { x: drawX, y: drawY, w: drawW, h: drawH };

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(loadedImg, drawX, drawY, drawW, drawH);
      const pixelData = ctx.getImageData(drawX, drawY, drawW, drawH);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const newDests: { x: number; y: number }[] = [];
      const inc = Math.max(1, Math.round(drawW / DENSITY));
      for (let i = 0; i < drawW; i += inc) {
        for (let j = 0; j < drawH; j += inc) {
          if (pixelData.data[(i + j * drawW) * 4 + 3] > 128) {
            newDests.push({ x: drawX + i, y: drawY + j });
          }
        }
      }

      if (particles.length === 0) {
        particles = newDests.map((d) => ({
          x: Math.random() * w, y: Math.random() * h,
          destX: d.x, destY: d.y,
          vx: (Math.random() - 0.5) * PARTICLE_SPEED,
          vy: (Math.random() - 0.5) * PARTICLE_SPEED,
          friction: Math.random() * 0.01 + 0.92,
          color: randColor(),
          radius: PARTICLE_SIZE * (0.4 + Math.random() * 0.6),
        }));
      } else {
        const next: Particle[] = [];
        for (let i = 0; i < newDests.length; i++) {
          if (i < particles.length) {
            particles[i].destX = newDests[i].x;
            particles[i].destY = newDests[i].y;
            next.push(particles[i]);
          } else {
            const src = particles[Math.floor(Math.random() * particles.length)];
            next.push({
              x: src.x, y: src.y,
              destX: newDests[i].x, destY: newDests[i].y,
              vx: (Math.random() - 0.5) * PARTICLE_SPEED,
              vy: (Math.random() - 0.5) * PARTICLE_SPEED,
              friction: Math.random() * 0.01 + 0.92,
              color: randColor(),
              radius: PARTICLE_SIZE * (0.4 + Math.random() * 0.6),
            });
          }
        }
        particles = next;
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      size = { w: rect.width, h: rect.height };
      canvas.width = rect.width;
      canvas.height = rect.height;
      buildBg(rect.width, rect.height);
      createParticles();
    };

    const animate = () => {
      // Skip rendering when not active (saves GPU/battery on iPad)
      if (!isActiveRef.current) {
        animId = requestAnimationFrame(animate);
        return;
      }

      const { w, h } = size;
      if (bgCanvas) {
        ctx.drawImage(bgCanvas, 0, 0);
      } else {
        ctx.clearRect(0, 0, w, h);
      }

      const ib = imgBounds;
      const norm = pointer.current;
      const pad = Math.max(ib.w, ib.h) * 0.15;
      const mx = ib.x + ib.w / 2 + norm.x * (ib.w / 2 + pad);
      const my = ib.y + ib.h / 2 + norm.y * (ib.h / 2 + pad);

      for (const p of particles) {
        const dx = p.destX - p.x;
        const dy = p.destY - p.y;
        const distToDest = Math.sqrt(dx * dx + dy * dy);
        if (distToDest < 3 && RESTLESS > 0) {
          p.x += (Math.random() - 0.5) * RESTLESS * 0.3;
          p.y += (Math.random() - 0.5) * RESTLESS * 0.3;
        }
        p.vx = (p.vx + dx / 500) * p.friction;
        p.vy = (p.vy + dy / 500) * p.friction;

        const dmx = mx - p.x;
        const dmy = my - p.y;
        const mouseDist = Math.sqrt(dmx * dmx + dmy * dmy);
        const attractDist = Math.max(ib.w, ib.h) * ATTRACT_PCT;
        if (mouseDist < attractDist && mouseDist > 1) {
          const invStr = Math.max(300 - ATTRACT_STRENGTH, 10);
          const force = (attractDist - mouseDist) / invStr;
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

      // Sparkle cluster
      const t = performance.now() * 0.001;
      for (let i = 0; i < 6; i++) {
        const angle = t * (1.5 + i * 0.4) + (i * Math.PI * 2) / 6;
        const orbit = 8 + Math.sin(t * 2 + i) * 6;
        const sx = mx + Math.cos(angle) * orbit;
        const sy = my + Math.sin(angle) * orbit;
        const sparkleAlpha = 0.5 + Math.sin(t * 4 + i * 1.3) * 0.4;
        const sr = 1.0 + Math.sin(t * 3 + i * 0.7) * 0.6;
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(220, 210, 255, ${sparkleAlpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
      const glowAlpha = 0.12 + Math.sin(t * 2.5) * 0.06;
      const grd = ctx.createRadialGradient(mx, my, 0, mx, my, 20);
      grd.addColorStop(0, `rgba(200, 180, 255, ${glowAlpha})`);
      grd.addColorStop(1, "rgba(200, 180, 255, 0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(mx, my, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      animId = requestAnimationFrame(animate);
    };

    const img = new Image();
    img.onload = () => {
      loadedImg = img;
      imageLoaded = true;
      createParticles();
    };
    img.src = IMAGE_SRC;

    resize();
    animId = requestAnimationFrame(animate);

    const obs = new ResizeObserver(resize);
    obs.observe(canvas);

    return () => {
      cancelAnimationFrame(animId);
      obs.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      className="h-[100dvh] w-full relative snap-start snap-always"
      style={{ scrollSnapAlign: "start" }}
    >
      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#0a0618" }}
      />

      {/* Birthday text overlay */}
      <div
        className="absolute inset-x-0 top-0 flex flex-col items-center justify-center pointer-events-none z-10"
        style={{
          height: "18%",
          opacity: textVisible ? 1 : 0,
          transform: textVisible ? "translateY(0)" : "translateY(-20px)",
          transition: "opacity 1s ease-out, transform 1s ease-out",
        }}
      >
        <h1
          className="text-4xl md:text-6xl font-bold tracking-wider text-center"
          style={{
            background: "linear-gradient(135deg, #ffd700, #ff69b4, #ffd700, #da70d6)",
            backgroundSize: "300% 300%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "shimmer 3s ease-in-out infinite",
            textShadow: "none",
            filter: "drop-shadow(0 0 20px rgba(255,215,0,0.4)) drop-shadow(0 0 40px rgba(218,112,214,0.3))",
          }}
        >
          HAPPY BIRTHDAY
        </h1>
        <h2
          className="text-5xl md:text-7xl font-bold tracking-widest mt-1"
          style={{
            background: "linear-gradient(135deg, #da70d6, #ffd700, #ff69b4, #ffd700)",
            backgroundSize: "300% 300%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "shimmer 3s ease-in-out infinite 0.5s",
            filter: "drop-shadow(0 0 25px rgba(255,215,0,0.5)) drop-shadow(0 0 50px rgba(218,112,214,0.4))",
          }}
        >
          CECE!
        </h2>
      </div>

      {/* Sparkle decorations around text */}
      {textVisible && (
        <div className="absolute inset-x-0 top-0 pointer-events-none z-10" style={{ height: "20%" }}>
          {BIRTHDAY_SPARKLES.map((s, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: `${s.size}px`,
                height: `${s.size}px`,
                top: `${s.top}%`,
                left: `${s.left}%`,
                background: s.color,
                animation: `sparkle ${s.animDuration}s ease-in-out infinite alternate`,
                animationDelay: `${s.animDelay}s`,
                boxShadow: `0 0 ${s.shadow}px currentColor`,
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
