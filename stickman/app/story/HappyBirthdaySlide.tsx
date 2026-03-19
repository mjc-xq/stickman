"use client";

import { useEffect, useRef } from "react";
import { usePointer } from "@/app/hooks/stickman";

const TEXT_IMAGE = "/images/story/birthday-text.png";
const FACE_IMAGE = "/images/bt4-clean.png";
const DENSITY = 220;
const PARTICLE_SIZE = 1.0;
const PARTICLE_SPEED = 1;
const ATTRACT_PCT = 0.15;
const ATTRACT_STRENGTH = 50;
const CANVAS_PCT = 80;
const RESTLESS = 5;
const MORPH_DELAY_S = 8; // seconds before morphing text → face

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
    "#ffd700", "#ff69b4", "#da70d6", "#c8d8ff",
    "#a0b8f0", "#8090dd", "#b0a0e8", "#d0c8ff",
    "#ffe0b0", "#ffffff", "#e8e8f0",
  ];
  return palettes[Math.floor(Math.random() * palettes.length)];
}

interface HappyBirthdaySlideProps {
  isActive: boolean;
}

export function HappyBirthdaySlide({ isActive }: HappyBirthdaySlideProps) {
  const pointer = usePointer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isActiveRef = useRef(isActive);

  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    let animId = 0;
    let particles: Particle[] = [];
    let bgCanvas: HTMLCanvasElement | null = null;
    let imgBounds = { x: 0, y: 0, w: 0, h: 0 };
    let size = { w: 0, h: 0 };
    let textImg: HTMLImageElement | null = null;
    let faceImg: HTMLImageElement | null = null;
    let textLoaded = false;
    let faceLoaded = false;
    let morphedToFace = false;
    let activatedAt = 0;

    // Moon state
    let moonStartTime = 0;

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

    const sampleImage = (img: HTMLImageElement): { x: number; y: number }[] => {
      const { w, h } = size;
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
      imgBounds = { x: drawX, y: drawY, w: drawW, h: drawH };

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      const pixelData = ctx.getImageData(drawX, drawY, drawW, drawH);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const dests: { x: number; y: number }[] = [];
      const inc = Math.max(1, Math.round(drawW / DENSITY));

      // For text image: black pixels on white bg (detect dark pixels)
      // For face image: opaque pixels on transparent bg (detect alpha)
      const isTextImage = img === textImg;

      for (let i = 0; i < drawW; i += inc) {
        for (let j = 0; j < drawH; j += inc) {
          const idx = (i + j * drawW) * 4;
          const r = pixelData.data[idx];
          const g = pixelData.data[idx + 1];
          const b = pixelData.data[idx + 2];
          const a = pixelData.data[idx + 3];

          if (isTextImage) {
            // Black text on white: detect dark pixels
            const brightness = (r + g + b) / 3;
            if (a > 128 && brightness < 128) {
              dests.push({ x: drawX + i, y: drawY + j });
            }
          } else {
            // Transparent bg: detect opaque pixels
            if (a > 128) {
              dests.push({ x: drawX + i, y: drawY + j });
            }
          }
        }
      }
      return dests;
    };

    const createOrUpdateParticles = (dests: { x: number; y: number }[]) => {
      const { w, h } = size;
      if (particles.length === 0) {
        // First time: scatter particles randomly
        particles = dests.map((d) => ({
          x: Math.random() * w, y: Math.random() * h,
          destX: d.x, destY: d.y,
          vx: (Math.random() - 0.5) * PARTICLE_SPEED,
          vy: (Math.random() - 0.5) * PARTICLE_SPEED,
          friction: Math.random() * 0.01 + 0.92,
          color: randColor(),
          radius: PARTICLE_SIZE * (0.4 + Math.random() * 0.6),
        }));
      } else {
        // Morph: reuse existing particles, update destinations
        const next: Particle[] = [];
        for (let i = 0; i < dests.length; i++) {
          if (i < particles.length) {
            particles[i].destX = dests[i].x;
            particles[i].destY = dests[i].y;
            next.push(particles[i]);
          } else {
            const src = particles[Math.floor(Math.random() * particles.length)];
            next.push({
              x: src.x, y: src.y,
              destX: dests[i].x, destY: dests[i].y,
              vx: (Math.random() - 0.5) * PARTICLE_SPEED,
              vy: (Math.random() - 0.5) * PARTICLE_SPEED,
              friction: Math.random() * 0.01 + 0.92,
              color: randColor(),
              radius: PARTICLE_SIZE * (0.4 + Math.random() * 0.6),
            });
          }
        }
        // If we have more particles than dests, reassign extras to random dests
        for (let i = dests.length; i < particles.length; i++) {
          const d = dests[Math.floor(Math.random() * dests.length)];
          particles[i].destX = d.x;
          particles[i].destY = d.y;
          next.push(particles[i]);
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
      // Rebuild particles from current target
      if (morphedToFace && faceImg && faceLoaded) {
        createOrUpdateParticles(sampleImage(faceImg));
      } else if (textImg && textLoaded) {
        createOrUpdateParticles(sampleImage(textImg));
      }
    };

    const drawMoon = (t: number) => {
      const { w, h } = size;
      if (moonStartTime === 0) moonStartTime = t;
      const elapsed = t - moonStartTime;
      const moonProgress = Math.min(elapsed / 5, 1); // 5 second arc
      const moonAngle = Math.PI + moonProgress * Math.PI;
      const moonCx = w / 2;
      const moonCy = h * 0.65;
      const moonRx = w * 0.42;
      const moonRy = h * 0.45;
      const moonX = moonCx + Math.cos(moonAngle) * moonRx;
      const moonY = moonCy + Math.sin(moonAngle) * moonRy;
      const moonSize = Math.min(w, h) * 0.06;

      // Glow
      const moonGlow = ctx.createRadialGradient(moonX, moonY, moonSize * 0.5, moonX, moonY, moonSize * 2.5);
      moonGlow.addColorStop(0, "rgba(255, 248, 220, 0.12)");
      moonGlow.addColorStop(1, "rgba(255, 248, 220, 0)");
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonSize * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = "#fff8dc";
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonSize, 0, Math.PI * 2);
      ctx.fill();

      // Crescent
      ctx.fillStyle = "rgba(10, 6, 24, 0.7)";
      ctx.beginPath();
      ctx.arc(moonX + moonSize * 0.3, moonY - moonSize * 0.1, moonSize * 0.85, 0, Math.PI * 2);
      ctx.fill();
    };

    const animate = () => {
      if (!isActiveRef.current) {
        animId = requestAnimationFrame(animate);
        return;
      }

      if (activatedAt === 0) activatedAt = performance.now() * 0.001;

      const { w, h } = size;
      if (bgCanvas) {
        ctx.drawImage(bgCanvas, 0, 0);
      } else {
        ctx.clearRect(0, 0, w, h);
      }

      const t = performance.now() * 0.001;
      const elapsed = t - activatedAt;

      // Draw moon behind particles
      drawMoon(t);

      // Check if it's time to morph text → face
      if (!morphedToFace && elapsed > MORPH_DELAY_S && faceImg && faceLoaded) {
        morphedToFace = true;
        const dests = sampleImage(faceImg);
        createOrUpdateParticles(dests);
      }

      // Pointer interaction
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

      // Sparkle cluster around pointer
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

    // Load both images
    const img1 = new Image();
    img1.onload = () => {
      textImg = img1;
      textLoaded = true;
      if (size.w > 0) {
        const dests = sampleImage(img1);
        createOrUpdateParticles(dests);
      }
    };
    img1.src = TEXT_IMAGE;

    const img2 = new Image();
    img2.onload = () => {
      faceImg = img2;
      faceLoaded = true;
    };
    img2.src = FACE_IMAGE;

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
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#0a0618" }}
      />
    </section>
  );
}
