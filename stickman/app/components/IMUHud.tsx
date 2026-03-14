"use client";

import { useEffect, useRef } from "react";
import { useSmoothedIMU } from "@/app/hooks/stickman";

export function IMUHud() {
  const smoothedIMU = useSmoothedIMU();
  const accelRef = useRef<HTMLSpanElement>(null);
  const gyroRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let id: number;
    let frameCount = 0;
    const update = () => {
      frameCount++;
      if (frameCount % 3 === 0) {
        const s = smoothedIMU.current;
        if (accelRef.current) {
          accelRef.current.textContent =
            `ax ${s.ax.toFixed(3)} ay ${s.ay.toFixed(3)} az ${s.az.toFixed(3)}`;
        }
        if (gyroRef.current) {
          gyroRef.current.textContent =
            `gx ${s.gx.toFixed(1)} gy ${s.gy.toFixed(1)} gz ${s.gz.toFixed(1)}`;
        }
      }
      id = requestAnimationFrame(update);
    };
    id = requestAnimationFrame(update);
    return () => cancelAnimationFrame(id);
  }, [smoothedIMU]);

  return (
    <div className="absolute bottom-4 left-4 z-20 pointer-events-none font-mono text-[10px] text-zinc-600 flex flex-col gap-0.5">
      <span ref={accelRef} />
      <span ref={gyroRef} />
    </div>
  );
}
