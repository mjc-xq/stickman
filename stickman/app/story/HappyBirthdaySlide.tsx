"use client";

import { useEffect, useRef, useState } from "react";

interface HappyBirthdaySlideProps {
  isActive: boolean;
}

export function HappyBirthdaySlide({ isActive }: HappyBirthdaySlideProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (isActive) {
      const t = setTimeout(() => setRevealed(true), 300);
      return () => clearTimeout(t);
    } else {
      setRevealed(false);
    }
  }, [isActive]);

  // Canvas animation: moon arc + star-text for "Happy Birthday" and "You're a Star!"
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    let animId = 0;
    let w = 0, h = 0;
    let startTime = 0;
    let textParticles: { x: number; y: number; color: string; size: number; delay: number }[] = [];

    const buildTextParticles = () => {
      textParticles = [];
      if (w === 0 || h === 0) return;

      // Render text offscreen to sample pixels
      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      const offCtx = offscreen.getContext("2d")!;

      const fontSize1 = Math.min(w * 0.09, 72);
      const fontSize2 = Math.min(w * 0.07, 56);

      // Line 1: "Happy Birthday"
      offCtx.font = `bold ${fontSize1}px system-ui, sans-serif`;
      offCtx.textAlign = "center";
      offCtx.textBaseline = "middle";
      offCtx.fillStyle = "white";
      offCtx.fillText("Happy Birthday", w / 2, h * 0.4);

      // Line 2: "You're a Star!"
      offCtx.font = `bold ${fontSize2}px system-ui, sans-serif`;
      offCtx.fillText("You're a Star!", w / 2, h * 0.55);

      // Sample pixels to create star particles
      const imageData = offCtx.getImageData(0, 0, w, h);
      const spacing = Math.max(3, Math.round(w / 300));
      const colors = ["#ffd700", "#ff69b4", "#da70d6", "#ffffff", "#c8d8ff", "#ffe0b0"];
      let particleIdx = 0;

      for (let y = 0; y < h; y += spacing) {
        for (let x = 0; x < w; x += spacing) {
          const idx = (y * w + x) * 4;
          if (imageData.data[idx + 3] > 128) {
            textParticles.push({
              x,
              y,
              color: colors[particleIdx % colors.length],
              size: 1 + Math.random() * 1.5,
              delay: Math.random() * 2,
            });
            particleIdx++;
          }
        }
      }
    };

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      buildTextParticles();
    };

    const animate = () => {
      if (w === 0 || h === 0) { animId = requestAnimationFrame(animate); return; }
      const t = performance.now() * 0.001;
      if (startTime === 0) startTime = t;
      const elapsed = t - startTime;

      ctx.clearRect(0, 0, w, h);

      // Moon: arcs across the top third of the screen
      const moonProgress = Math.min(elapsed / 4, 1); // 4 second arc
      const moonAngle = Math.PI + moonProgress * Math.PI; // right to left arc
      const moonCx = w / 2;
      const moonCy = h * 0.6;
      const moonRx = w * 0.4;
      const moonRy = h * 0.4;
      const moonX = moonCx + Math.cos(moonAngle) * moonRx;
      const moonY = moonCy + Math.sin(moonAngle) * moonRy;
      const moonSize = Math.min(w, h) * 0.08;

      // Moon glow
      const moonGlow = ctx.createRadialGradient(moonX, moonY, moonSize * 0.5, moonX, moonY, moonSize * 3);
      moonGlow.addColorStop(0, "rgba(255, 248, 220, 0.15)");
      moonGlow.addColorStop(0.5, "rgba(255, 248, 220, 0.05)");
      moonGlow.addColorStop(1, "rgba(255, 248, 220, 0)");
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonSize * 3, 0, Math.PI * 2);
      ctx.fill();

      // Moon body
      ctx.fillStyle = "#fff8dc";
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonSize, 0, Math.PI * 2);
      ctx.fill();

      // Moon crescent shadow
      ctx.fillStyle = "rgba(10, 6, 24, 0.7)";
      ctx.beginPath();
      ctx.arc(moonX + moonSize * 0.3, moonY - moonSize * 0.1, moonSize * 0.85, 0, Math.PI * 2);
      ctx.fill();

      // Moon trail
      if (moonProgress < 1) {
        for (let i = 0; i < 8; i++) {
          const trailProgress = Math.max(0, moonProgress - i * 0.03);
          const trailAngle = Math.PI + trailProgress * Math.PI;
          const tx = moonCx + Math.cos(trailAngle) * moonRx;
          const ty = moonCy + Math.sin(trailAngle) * moonRy;
          const alpha = (1 - i / 8) * 0.15;
          const sr = moonSize * 0.3 * (1 - i / 8);
          ctx.fillStyle = `rgba(255, 248, 220, ${alpha})`;
          ctx.beginPath();
          ctx.arc(tx, ty, sr, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Star-text particles (fade in after moon starts moving)
      const textFade = Math.min(Math.max(elapsed - 1, 0) / 2, 1);
      if (textFade > 0) {
        ctx.globalCompositeOperation = "lighter";
        for (const p of textParticles) {
          const particleAlpha = Math.min(textFade, Math.max(0, (elapsed - 1 - p.delay) / 0.5));
          if (particleAlpha <= 0) continue;

          const twinkle = 0.5 + Math.sin(t * 3 + p.delay * 10) * 0.5;
          const alpha = particleAlpha * (0.4 + twinkle * 0.6);
          const size = p.size * (0.7 + twinkle * 0.3);

          ctx.fillStyle = p.color.replace(")", `, ${alpha})`).replace("rgb", "rgba").replace("#", "");
          // Hex to rgba
          const hex = p.color;
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fill();

          // Small glow
          if (twinkle > 0.7) {
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.3})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size * 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalCompositeOperation = "source-over";
      }

      animId = requestAnimationFrame(animate);
    };

    resize();
    animId = requestAnimationFrame(animate);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      startTime = 0;
    };
  }, [revealed]);

  return (
    <section
      className="h-[100dvh] w-full relative snap-start snap-always"
      style={{ scrollSnapAlign: "start" }}
    >
      {revealed && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full z-10"
          style={{ pointerEvents: "none" }}
        />
      )}
    </section>
  );
}
