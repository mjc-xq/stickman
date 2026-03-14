"use client";

import { useChannel, usePresence, usePresenceListener } from "ably/react";
import { useEffect, useRef, useState } from "react";
import { ConnectionState } from "./ConnectionState";

interface IMUData {
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
  p: number; // pitch (degrees) — atan2(ax, sqrt(ay²+az²))
  r: number; // roll (degrees)  — atan2(ay, sqrt(ax²+az²))
  t: number;
}

const SMOOTHING = 0.08;
const FADE_RATE = 0.012;

export function IMUVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arrowRef = useRef<SVGGElement>(null);
  const tiltRingRef = useRef<SVGCircleElement>(null);

  const target = useRef({ ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0, p: 0, r: 0, t: 0 });
  const smooth = useRef({ ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0, p: 0, r: 0, t: 0 });
  const lastDot = useRef<{ x: number; y: number } | null>(null);
  const canvasCSS = useRef({ w: 300, h: 300 });
  const msgCount = useRef(0);

  const [rawData, setRawData] = useState<IMUData | null>(null);
  const [receiving, setReceiving] = useState(false);

  usePresence("stickman", { type: "web" });
  const { presenceData } = usePresenceListener("stickman");

  useChannel("stickman", (message) => {
    if (message.name !== "imu") return;
    try {
      const data: IMUData =
        typeof message.data === "string" ? JSON.parse(message.data) : message.data;
      target.current = data;
      if (!receiving) setReceiving(true);
      msgCount.current++;
      if (msgCount.current % 3 === 0) setRawData(data);
    } catch {
      // ignore parse errors
    }
  });

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
      const s = smooth.current;
      const t = target.current;

      // Smooth all values
      s.ax += (t.ax - s.ax) * SMOOTHING;
      s.ay += (t.ay - s.ay) * SMOOTHING;
      s.az += (t.az - s.az) * SMOOTHING;
      s.gx += (t.gx - s.gx) * SMOOTHING;
      s.gy += (t.gy - s.gy) * SMOOTHING;
      s.gz += (t.gz - s.gz) * SMOOTHING;
      s.p += (t.p - s.p) * SMOOTHING;
      s.r += (t.r - s.r) * SMOOTHING;

      // --- Arrow: rotation from pitch (side tilt) and roll (forward tilt) ---
      if (arrowRef.current) {
        const angle = Math.atan2(s.r, s.p) * (180 / Math.PI);
        arrowRef.current.setAttribute("transform", `rotate(${angle})`);
      }
      if (tiltRingRef.current) {
        const tiltMag = Math.min(Math.sqrt(s.p * s.p + s.r * s.r) / 90, 1);
        const circ = 2 * Math.PI * 85;
        tiltRingRef.current.setAttribute("stroke-dasharray", `${circ * tiltMag} ${circ}`);
        tiltRingRef.current.setAttribute(
          "stroke",
          `rgba(0, 212, 255, ${0.06 + tiltMag * 0.5})`
        );
      }

      // --- Canvas ---
      const canvas = canvasRef.current;
      if (!canvas) {
        id = requestAnimationFrame(animate);
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        id = requestAnimationFrame(animate);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const w = canvasCSS.current.w;
      const h = canvasCSS.current.h;
      const cx = w / 2;
      const cy = h / 2;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Persistence fade — previous strokes slowly dim
      ctx.fillStyle = `rgba(0,0,0,${FADE_RATE})`;
      ctx.fillRect(0, 0, w, h);

      // Dot position: roll drives X, pitch drives Y (inverted for screen coords)
      const scale = Math.min(w, h) * 0.4;
      const dotX = cx + (s.r / 90) * scale;
      const dotY = cy - (s.p / 90) * scale;

      if (receiving) {
        // Hue cycles slowly, shifts warmer when spinning fast
        const gyroMag = Math.sqrt(s.gx * s.gx + s.gy * s.gy + s.gz * s.gz);
        const intensity = Math.min(gyroMag / 300, 1);
        const hue = (Date.now() * 0.04) % 360;
        const sat = 85 + intensity * 15;
        const lit = 55 + intensity * 20;
        const color = `hsl(${hue}, ${sat}%, ${lit}%)`;

        // Stroke from last position to current (fills gaps)
        const prev = lastDot.current;
        if (prev) {
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(dotX, dotY);
          ctx.strokeStyle = color;
          ctx.lineWidth = 10;
          ctx.lineCap = "round";
          ctx.stroke();
        }

        // Additive glow — overlapping areas bloom brighter
        ctx.globalCompositeOperation = "lighter";

        // Wide soft aura
        const grd = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, 50);
        grd.addColorStop(0, `hsla(${hue}, ${sat}%, ${lit}%, 0.5)`);
        grd.addColorStop(0.3, `hsla(${hue}, ${sat}%, ${lit}%, 0.12)`);
        grd.addColorStop(1, `hsla(${hue}, ${sat}%, ${lit}%, 0)`);
        ctx.beginPath();
        ctx.arc(dotX, dotY, 50, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        ctx.globalCompositeOperation = "source-over";

        // Bright dot
        ctx.beginPath();
        ctx.arc(dotX, dotY, 10, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // White-hot center
        ctx.beginPath();
        ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();

        lastDot.current = { x: dotX, y: dotY };
      }

      ctx.restore();
      id = requestAnimationFrame(animate);
    };

    id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, [receiving]);

  // Compass ticks
  const ticks = [];
  for (let i = 0; i < 360; i += 10) {
    const rad = (i * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const isMajor = i % 90 === 0;
    const isMedium = i % 30 === 0;
    const inner = isMajor ? 92 : isMedium ? 96 : 100;
    const outer = 106;
    ticks.push(
      <line
        key={i}
        x1={sin * inner}
        y1={-cos * inner}
        x2={sin * outer}
        y2={-cos * outer}
        stroke={isMajor ? "#555" : isMedium ? "#444" : "#2a2a2a"}
        strokeWidth={isMajor ? 2.5 : isMedium ? 1.5 : 0.8}
      />
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#0a0a0a] text-zinc-100 select-none overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 shrink-0">
        <h1 className="text-sm font-semibold tracking-wide">STICKMAN</h1>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-zinc-500">
            {presenceData.length} connected
          </span>
          <ConnectionState />
        </div>
      </header>

      {/* Full-screen dot canvas */}
      <div className="flex-1 relative min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
        />
        {!receiving && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="text-zinc-500 animate-pulse text-base tracking-wide">
              Waiting for device…
            </p>
          </div>
        )}

        {/* Arrow compass — overlaid bottom-right */}
        <div className="absolute bottom-4 right-4 z-20 pointer-events-none">
          <svg viewBox="-120 -120 240 240" className="w-28 h-28 sm:w-36 sm:h-36 drop-shadow-lg">
            {/* Inner dark fill */}
            <circle cx="0" cy="0" r="108" fill="#0d0d0d" opacity="0.85" />
            {/* Outer ring */}
            <circle cx="0" cy="0" r="108" fill="none" stroke="#1a1a1a" strokeWidth="2" />

            {/* Ticks */}
            {ticks}

            {/* Tilt magnitude ring */}
            <circle
              ref={tiltRingRef}
              cx="0"
              cy="0"
              r="85"
              fill="none"
              stroke="rgba(0,212,255,0.06)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray="0 534"
              transform="rotate(-90)"
            />

            {/* Center crosshair */}
            <line x1="-12" y1="0" x2="12" y2="0" stroke="#333" strokeWidth="0.8" />
            <line x1="0" y1="-12" x2="0" y2="12" stroke="#333" strokeWidth="0.8" />
            <circle cx="0" cy="0" r="3" fill="#222" />

            {/* Arrow (rotates) */}
            <g ref={arrowRef}>
              {/* Shaft */}
              <line
                x1="0"
                y1="35"
                x2="0"
                y2="-62"
                stroke="#00d4ff"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.85"
              />
              {/* Head */}
              <polygon points="0,-80 -11,-56 0,-64 11,-56" fill="#00d4ff" />
              {/* Tail dot */}
              <circle cx="0" cy="40" r="3.5" fill="#00d4ff" opacity="0.3" />
            </g>
          </svg>
          {rawData && (
            <div className="text-center font-mono text-[9px] text-zinc-500 mt-0.5">
              {rawData.p.toFixed(1)}° / {rawData.r.toFixed(1)}°
            </div>
          )}
        </div>

        {/* HUD overlay — bottom-left */}
        {rawData && (
          <div className="absolute bottom-4 left-4 z-20 pointer-events-none font-mono text-[10px] text-zinc-600 flex flex-col gap-0.5">
            <span>
              ax <span className="text-zinc-400">{rawData.ax.toFixed(3)}</span>{" "}
              ay <span className="text-zinc-400">{rawData.ay.toFixed(3)}</span>{" "}
              az <span className="text-zinc-400">{rawData.az.toFixed(3)}</span>
            </span>
            <span>
              gx <span className="text-zinc-500">{rawData.gx.toFixed(1)}</span>{" "}
              gy <span className="text-zinc-500">{rawData.gy.toFixed(1)}</span>{" "}
              gz <span className="text-zinc-500">{rawData.gz.toFixed(1)}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
