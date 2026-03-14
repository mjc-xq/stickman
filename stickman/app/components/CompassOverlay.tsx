"use client";

import { useEffect, useRef } from "react";
import { useOrientation, useSmoothedIMU } from "@/app/hooks/stickman";

// Generate compass ticks once (static)
const ticks: { x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number }[] = [];
for (let i = 0; i < 360; i += 10) {
  const rad = (i * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const isMajor = i % 90 === 0;
  const isMedium = i % 30 === 0;
  const inner = isMajor ? 92 : isMedium ? 96 : 100;
  const outer = 106;
  ticks.push({
    x1: sin * inner,
    y1: -cos * inner,
    x2: sin * outer,
    y2: -cos * outer,
    stroke: isMajor ? "#555" : isMedium ? "#444" : "#2a2a2a",
    strokeWidth: isMajor ? 2.5 : isMedium ? 1.5 : 0.8,
  });
}

export function CompassOverlay() {
  const orientation = useOrientation();
  const smoothedIMU = useSmoothedIMU();
  const arrowRef = useRef<SVGGElement>(null);
  const tiltRingRef = useRef<SVGCircleElement>(null);
  const pitchRollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id: number;
    const update = () => {
      const o = orientation.current;

      if (arrowRef.current) {
        arrowRef.current.setAttribute("transform", `rotate(${o.angle})`);
      }
      if (tiltRingRef.current) {
        const circ = 2 * Math.PI * 85;
        tiltRingRef.current.setAttribute(
          "stroke-dasharray",
          `${circ * o.tiltMag} ${circ}`,
        );
        tiltRingRef.current.setAttribute(
          "stroke",
          `rgba(0, 212, 255, ${0.06 + o.tiltMag * 0.5})`,
        );
      }
      if (pitchRollRef.current) {
        const s = smoothedIMU.current;
        pitchRollRef.current.textContent = `${s.p.toFixed(1)}\u00B0 / ${s.r.toFixed(1)}\u00B0`;
      }

      id = requestAnimationFrame(update);
    };
    id = requestAnimationFrame(update);
    return () => cancelAnimationFrame(id);
  }, [orientation, smoothedIMU]);

  return (
    <div className="absolute bottom-4 right-4 z-20 pointer-events-none">
      <svg
        viewBox="-120 -120 240 240"
        className="w-28 h-28 sm:w-36 sm:h-36 drop-shadow-lg"
      >
        <circle cx="0" cy="0" r="108" fill="#0d0d0d" opacity="0.85" />
        <circle
          cx="0"
          cy="0"
          r="108"
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="2"
        />
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.stroke}
            strokeWidth={t.strokeWidth}
          />
        ))}
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
        <line
          x1="-12"
          y1="0"
          x2="12"
          y2="0"
          stroke="#333"
          strokeWidth="0.8"
        />
        <line
          x1="0"
          y1="-12"
          x2="0"
          y2="12"
          stroke="#333"
          strokeWidth="0.8"
        />
        <circle cx="0" cy="0" r="3" fill="#222" />
        <g ref={arrowRef}>
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
          <polygon points="0,-80 -11,-56 0,-64 11,-56" fill="#00d4ff" />
          <circle cx="0" cy="40" r="3.5" fill="#00d4ff" opacity="0.3" />
        </g>
      </svg>
      <div
        ref={pitchRollRef}
        className="text-center font-mono text-[9px] text-zinc-500 mt-0.5"
      />
    </div>
  );
}
