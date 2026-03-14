"use client";

import { useEffect, useRef } from "react";
import { usePointer, useSmoothedIMU, useStickmanStatus, pointerToScreen } from "@/app/hooks/stickman";

interface TrailPoint {
  x: number;
  y: number;
  hue: number;
  sat: number;
  lit: number;
}

const TRAIL_LEN = 150;

export function PaintViz() {
  const pointer = usePointer();
  const smoothedIMU = useSmoothedIMU();
  const { receiving } = useStickmanStatus();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trail = useRef<TrailPoint[]>([]);
  const hueAccum = useRef(0);
  const canvasCSS = useRef({ w: 300, h: 300 });
  const receivingRef = useRef(receiving);

  // Keep receivingRef in sync (avoid re-creating rAF loop on receiving change)
  useEffect(() => {
    receivingRef.current = receiving;
  }, [receiving]);

  // Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvasCSS.current = { w: rect.width, h: rect.height };
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(canvas);
    return () => obs.disconnect();
  }, []);

  // Animation loop
  useEffect(() => {
    let id: number;

    const animate = () => {
      const canvas = canvasRef.current;
      if (!canvas) { id = requestAnimationFrame(animate); return; }
      const ctx = canvas.getContext("2d");
      if (!ctx) { id = requestAnimationFrame(animate); return; }

      const dpr = window.devicePixelRatio || 1;
      const w = canvasCSS.current.w;
      const h = canvasCSS.current.h;

      const p = pointer.current;
      const screen = pointerToScreen(p, w, h);
      const dotX = screen.x;
      const dotY = screen.y;

      // Hue
      const imu = smoothedIMU.current;
      const gyroMag = Math.sqrt(imu.gx * imu.gx + imu.gy * imu.gy + imu.gz * imu.gz);
      const spin = Math.min(gyroMag / 300, 1);
      hueAccum.current += 0.6 + spin * 4;
      const hue = hueAccum.current % 360;
      const sat = 85 + spin * 15;
      const lit = 55 + spin * 20;

      // Trail
      if (receivingRef.current) {
        trail.current.push({ x: dotX, y: dotY, hue, sat, lit });
        if (trail.current.length > TRAIL_LEN) trail.current.shift();
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, w, h);

      const tr = trail.current;
      const tLen = tr.length;

      if (tLen > 1) {
        // Glow pass
        ctx.globalCompositeOperation = "lighter";
        const glowStart = Math.max(1, tLen - 40);
        for (let i = glowStart; i < tLen; i++) {
          const p0 = tr[i - 1];
          const p1 = tr[i];
          const frac = (i - glowStart) / (tLen - glowStart);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle = `hsla(${p1.hue}, ${p1.sat}%, ${p1.lit}%, ${frac * 0.15})`;
          ctx.lineWidth = 20 + frac * 16;
          ctx.lineCap = "round";
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";

        // Main trail
        for (let i = 1; i < tLen; i++) {
          const p0 = tr[i - 1];
          const p1 = tr[i];
          const frac = i / tLen;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle = `hsla(${p1.hue}, ${p1.sat}%, ${p1.lit}%, ${frac * 0.75})`;
          ctx.lineWidth = 2 + frac * 10;
          ctx.lineCap = "round";
          ctx.stroke();
        }

        // Core
        const coreStart = Math.max(1, tLen - 60);
        for (let i = coreStart; i < tLen; i++) {
          const p0 = tr[i - 1];
          const p1 = tr[i];
          const frac = (i - coreStart) / (tLen - coreStart);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.strokeStyle = `hsla(${p1.hue}, ${Math.max(p1.sat - 30, 0)}%, ${Math.min(p1.lit + 30, 95)}%, ${frac * 0.9})`;
          ctx.lineWidth = 1 + frac * 3;
          ctx.lineCap = "round";
          ctx.stroke();
        }
      }

      // Leading dot
      if (receivingRef.current) {
        const hue = hueAccum.current % 360;
        ctx.globalCompositeOperation = "lighter";
        const grd = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, 35);
        grd.addColorStop(0, `hsla(${hue}, ${sat}%, ${lit}%, 0.5)`);
        grd.addColorStop(0.4, `hsla(${hue}, ${sat}%, ${lit}%, 0.1)`);
        grd.addColorStop(1, `hsla(${hue}, ${sat}%, ${lit}%, 0)`);
        ctx.beginPath();
        ctx.arc(dotX, dotY, 35, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";

        ctx.beginPath();
        ctx.arc(dotX, dotY, 10, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${hue}, ${sat}%, ${lit}%)`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
      }

      ctx.restore();

      id = requestAnimationFrame(animate);
    };

    id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, [pointer, smoothedIMU]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
    />
  );
}
