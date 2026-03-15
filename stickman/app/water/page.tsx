"use client";

import { useState, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { StickmanProvider } from "@/app/hooks/stickman";
import { WaterSceneContent } from "./WaterScene";

function HUD({ onReset }: { onReset: () => void }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className="pointer-events-auto absolute bottom-6 right-6 flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-white backdrop-blur-md">
        <button
          className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium transition hover:bg-white/20"
          onClick={onReset}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function WaterContent() {
  const [resetToken, setResetToken] = useState(0);
  const handleReset = useCallback(() => setResetToken((v) => v + 1), []);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0b1118] text-white">
      <Canvas
        shadows
        camera={{ position: [0, 2.4, 6.6], fov: 42 }}
        gl={{ antialias: true }}
      >
        <WaterSceneContent resetToken={resetToken} />
      </Canvas>
      <HUD onReset={handleReset} />
    </div>
  );
}

export default function WaterPage() {
  return (
    <StickmanProvider>
      <WaterContent />
    </StickmanProvider>
  );
}
