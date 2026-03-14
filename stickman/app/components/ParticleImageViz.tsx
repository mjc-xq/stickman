"use client";

import { memo, useEffect, useRef } from "react";

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

const DENSITY = 80;
const PARTICLE_SIZE = 1.8;
const PARTICLE_SPEED = 1;
const REPULSE_DISTANCE = 120;
const REPULSE_STRENGTH = 180;
const CANVAS_PCT = 65;
const RESTLESS = 6;

interface ParticleImageVizProps {
  pointerRef: React.RefObject<{ x: number; y: number }>;
}

export const ParticleImageViz = memo(function ParticleImageViz({
  pointerRef,
}: ParticleImageVizProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    let particles: Particle[] = [];
    let animId: number;
    let w = 0;
    let h = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w;
      canvas.height = h;
    };

    const loadAndCreateParticles = () => {
      const img = new Image();
      img.onload = () => {
        // Size image to fit canvas
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

        // Draw image to read pixels
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        const pixelData = ctx.getImageData(drawX, drawY, drawW, drawH);
        ctx.clearRect(0, 0, w, h);

        // Create particles at opaque pixels
        particles = [];
        const inc = Math.round(drawW / DENSITY);
        const colors = ["#ffffff", "#d0d8ff", "#a0b0e0", "#c0c8ff"];
        for (let i = 0; i < drawW; i += inc) {
          for (let j = 0; j < drawH; j += inc) {
            const alpha = pixelData.data[(i + j * drawW) * 4 + 3];
            if (alpha > 128) {
              particles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                destX: drawX + i,
                destY: drawY + j,
                vx: (Math.random() - 0.5) * PARTICLE_SPEED,
                vy: (Math.random() - 0.5) * PARTICLE_SPEED,
                friction: Math.random() * 0.01 + 0.92,
                color: colors[Math.floor(Math.random() * colors.length)],
                radius: PARTICLE_SIZE * (0.5 + Math.random() * 0.5),
              });
            }
          }
        }

        animate();
      };
      img.src = "/images/bingo-t2-clean.png";
    };

    const animate = () => {
      ctx.clearRect(0, 0, w, h);

      // Get pointer position in canvas coords
      const norm = pointerRef.current;
      const mx = w / 2 + norm.x * w * 0.45;
      const my = h / 2 + norm.y * h * 0.45;

      for (const p of particles) {
        // Restlessness jitter at destination
        const dx = p.destX - p.x;
        const dy = p.destY - p.y;
        const distToDest = Math.sqrt(dx * dx + dy * dy);

        if (distToDest < 3 && RESTLESS > 0) {
          // Tiny jitter near destination
          p.x += (Math.random() - 0.5) * RESTLESS * 0.3;
          p.y += (Math.random() - 0.5) * RESTLESS * 0.3;
        }

        // Approach destination
        p.vx = (p.vx + dx / 500) * p.friction;
        p.vy = (p.vy + dy / 500) * p.friction;

        // Repulse from pointer
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

        // Draw
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(animate);
    };

    resize();
    loadAndCreateParticles();

    const obs = new ResizeObserver(() => {
      resize();
      loadAndCreateParticles();
    });
    obs.observe(canvas);

    return () => {
      cancelAnimationFrame(animId);
      obs.disconnect();
    };
  }, [pointerRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ background: "#050510" }}
    />
  );
});
