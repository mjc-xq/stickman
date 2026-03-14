"use client";

import { useState } from "react";
import { useStickmanStatus } from "@/app/hooks/stickman";
import { ConnectionState } from "./ConnectionState";
import { ConstellationViz } from "./ConstellationViz";
import { ParticleImageViz } from "./ParticleImageViz";
import { Model3DViz } from "./Model3DViz";
import { PaintViz } from "./PaintViz";
import { CompassOverlay } from "./CompassOverlay";
import { IMUHud } from "./IMUHud";

type VizMode = "paint" | "stars" | "bingo" | "3d";

export function IMUVisualizer() {
  const { receiving, presenceCount } = useStickmanStatus();
  const [mode, setMode] = useState<VizMode>("paint");

  return (
    <div className="flex flex-col h-[100dvh] bg-[#050505] text-zinc-100 select-none overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 shrink-0">
        <h1 className="text-sm font-semibold tracking-wide">STICKMAN</h1>
        <div className="flex items-center gap-3">
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
            {presenceCount} connected
          </span>
          <ConnectionState />
        </div>
      </header>

      {/* Visualization area */}
      <div className="flex-1 relative min-h-0">
        {mode === "paint" && <PaintViz />}
        {mode === "stars" && <ConstellationViz />}
        {mode === "bingo" && <ParticleImageViz />}
        {mode === "3d" && <Model3DViz />}

        {!receiving && (
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <p className="text-zinc-500 animate-pulse text-base tracking-wide">
              Waiting for device…
            </p>
          </div>
        )}

        <CompassOverlay />
        <IMUHud />
      </div>
    </div>
  );
}
