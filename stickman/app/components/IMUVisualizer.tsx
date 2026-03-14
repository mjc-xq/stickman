"use client";

import { useChannel, usePresence, usePresenceListener } from "ably/react";
import { useEffect, useRef, useState } from "react";
import { ConnectionState } from "./ConnectionState";
import { ConstellationViz } from "./ConstellationViz";
import { ParticleImageViz } from "./ParticleImageViz";
import { Model3DViz } from "./Model3DViz";

interface IMUData {
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
  p: number;
  r: number;
  t: number;
}

interface TrailPoint {
  x: number;
  y: number;
  hue: number;
  sat: number;
  lit: number;
}

type VizMode = "paint" | "stars" | "bingo" | "3d";

// --- Tuning ---
const SMOOTHING = 0.18;
const GRAV_LP = 0.08;
const POS_TRACK = 0.25;
const JOLT_GAIN = 0.03;
const JOLT_DEAD = 0.12;
const JOLT_DECAY = 0.85;
const TRAIL_LEN = 150;

export function IMUVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arrowRef = useRef<SVGGElement>(null);
  const tiltRingRef = useRef<SVGCircleElement>(null);

  const target = useRef({ ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0, p: 0, r: 0, t: 0 });
  const smooth = useRef({ ax: 0, ay: 0, az: 1, gx: 0, gy: 0, gz: 0, p: 0, r: 0, t: 0 });

  const grav = useRef({ x: 0, y: 0, z: 1 });
  const dotPos = useRef({ x: 0, y: 0 });
  const dotVel = useRef({ x: 0, y: 0 });
  const pointerNorm = useRef({ x: 0, y: 0 }); // shared with ConstellationViz
  const trail = useRef<TrailPoint[]>([]);
  const hueAccum = useRef(0);
  const canvasCSS = useRef({ w: 300, h: 300 });
  const msgCount = useRef(0);
  const modeRef = useRef<VizMode>("paint");

  const [rawData, setRawData] = useState<IMUData | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [mode, setMode] = useState<VizMode>("paint");

  // Keep modeRef in sync
  useEffect(() => { modeRef.current = mode; }, [mode]);

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
      // ignore
    }
  });

  // Canvas resize (only matters in paint mode, but keep it running)
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
  }, [mode]);

  // Animation loop — always processes IMU, conditionally draws
  useEffect(() => {
    let id: number;

    const animate = () => {
      const s = smooth.current;
      const t = target.current;
      const g = grav.current;
      const pos = dotPos.current;
      const vel = dotVel.current;

      // 1. Smooth raw IMU
      s.ax += (t.ax - s.ax) * SMOOTHING;
      s.ay += (t.ay - s.ay) * SMOOTHING;
      s.az += (t.az - s.az) * SMOOTHING;
      s.gx += (t.gx - s.gx) * SMOOTHING;
      s.gy += (t.gy - s.gy) * SMOOTHING;
      s.gz += (t.gz - s.gz) * SMOOTHING;

      // 2. Gravity estimate
      g.x += (s.ax - g.x) * GRAV_LP;
      g.y += (s.ay - g.y) * GRAV_LP;
      g.z += (s.az - g.z) * GRAV_LP;

      // 3. Renormalize gravity
      const gMag = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) || 1;
      const gnx = g.x / gMag;
      const gny = g.y / gMag;

      // 4. Linear acceleration perpendicular to gravity
      const accelDotG = s.ax * gnx + s.ay * gny + s.az * (g.z / gMag);
      let linX = s.ax - accelDotG * gnx;
      let linY = s.ay - accelDotG * gny;
      const linMag = Math.sqrt(linX * linX + linY * linY);
      if (linMag < JOLT_DEAD) { linX = 0; linY = 0; }

      // 5. Rest position
      const restX = -gnx;
      const restY = -gny;

      // 6. Position tracks tilt directly
      pos.x += (restX - pos.x) * POS_TRACK;
      pos.y += (restY - pos.y) * POS_TRACK;

      // 7. Jolt velocity
      vel.x = vel.x * JOLT_DECAY - linX * JOLT_GAIN;
      vel.y = vel.y * JOLT_DECAY - linY * JOLT_GAIN;

      // Final normalized position
      const finalX = Math.max(-2, Math.min(2, pos.x + vel.x));
      const finalY = Math.max(-2, Math.min(2, pos.y + vel.y));

      // Always update pointer for constellation mode
      pointerNorm.current = { x: finalX, y: finalY };

      // --- Arrow ---
      if (arrowRef.current) {
        const angle = Math.atan2(-gnx, gny) * (180 / Math.PI);
        arrowRef.current.setAttribute("transform", `rotate(${angle})`);
      }
      if (tiltRingRef.current) {
        const tiltMag = Math.sqrt(gnx * gnx + gny * gny);
        const circ = 2 * Math.PI * 85;
        tiltRingRef.current.setAttribute("stroke-dasharray", `${circ * tiltMag} ${circ}`);
        tiltRingRef.current.setAttribute("stroke", `rgba(0, 212, 255, ${0.06 + tiltMag * 0.5})`);
      }

      // --- Paint mode: draw canvas ---
      if (modeRef.current === "paint") {
        const canvas = canvasRef.current;
        if (!canvas) { id = requestAnimationFrame(animate); return; }
        const ctx = canvas.getContext("2d");
        if (!ctx) { id = requestAnimationFrame(animate); return; }

        const dpr = window.devicePixelRatio || 1;
        const w = canvasCSS.current.w;
        const h = canvasCSS.current.h;
        const cx = w / 2;
        const cy = h / 2;
        const scaleX = w * 0.45;
        const scaleY = h * 0.45;

        const dotX = cx + finalX * scaleX;
        const dotY = cy + finalY * scaleY;

        // Hue
        const gyroMag = Math.sqrt(s.gx * s.gx + s.gy * s.gy + s.gz * s.gz);
        const spin = Math.min(gyroMag / 300, 1);
        hueAccum.current += 0.6 + spin * 4;
        const hue = hueAccum.current % 360;
        const sat = 85 + spin * 15;
        const lit = 55 + spin * 20;

        // Trail
        if (receiving) {
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
        if (receiving) {
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
      }

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
    <div className="flex flex-col h-[100dvh] bg-[#050505] text-zinc-100 select-none overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 shrink-0">
        <h1 className="text-sm font-semibold tracking-wide">STICKMAN</h1>
        <div className="flex items-center gap-3">
          {/* Mode toggle */}
          <div className="flex bg-zinc-800/80 rounded-full p-0.5 gap-0.5">
            {([["paint", "Paint"], ["stars", "Stars"], ["bingo", "Bingo"], ["3d", "3D"]] as const).map(([m, label]) => (
              <button
                key={m}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  mode === m
                    ? "bg-zinc-600 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                onClick={() => setMode(m)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-zinc-500 text-xs">
            {presenceData.length} connected
          </span>
          <ConnectionState />
        </div>
      </header>

      {/* Visualization area */}
      <div className="flex-1 relative min-h-0">
        {/* Paint mode canvas */}
        {mode === "paint" && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
          />
        )}

        {/* Stars mode */}
        {mode === "stars" && (
          <ConstellationViz pointerRef={pointerNorm} />
        )}

        {/* Bingo particle image mode */}
        {mode === "bingo" && (
          <ParticleImageViz pointerRef={pointerNorm} />
        )}

        {/* 3D model mode */}
        {mode === "3d" && (
          <Model3DViz imuRef={smooth} />
        )}

        {!receiving && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="text-zinc-500 animate-pulse text-base tracking-wide">
              Waiting for device…
            </p>
          </div>
        )}

        {/* Arrow compass */}
        <div className="absolute bottom-4 right-4 z-20 pointer-events-none">
          <svg viewBox="-120 -120 240 240" className="w-28 h-28 sm:w-36 sm:h-36 drop-shadow-lg">
            <circle cx="0" cy="0" r="108" fill="#0d0d0d" opacity="0.85" />
            <circle cx="0" cy="0" r="108" fill="none" stroke="#1a1a1a" strokeWidth="2" />
            {ticks}
            <circle
              ref={tiltRingRef}
              cx="0" cy="0" r="85"
              fill="none" stroke="rgba(0,212,255,0.06)"
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray="0 534" transform="rotate(-90)"
            />
            <line x1="-12" y1="0" x2="12" y2="0" stroke="#333" strokeWidth="0.8" />
            <line x1="0" y1="-12" x2="0" y2="12" stroke="#333" strokeWidth="0.8" />
            <circle cx="0" cy="0" r="3" fill="#222" />
            <g ref={arrowRef}>
              <line x1="0" y1="35" x2="0" y2="-62" stroke="#00d4ff" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
              <polygon points="0,-80 -11,-56 0,-64 11,-56" fill="#00d4ff" />
              <circle cx="0" cy="40" r="3.5" fill="#00d4ff" opacity="0.3" />
            </g>
          </svg>
          {rawData && (
            <div className="text-center font-mono text-[9px] text-zinc-500 mt-0.5">
              {rawData.p.toFixed(1)}° / {rawData.r.toFixed(1)}°
            </div>
          )}
        </div>

        {/* HUD */}
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
