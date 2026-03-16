"use client";

import { useSmoothedIMU } from "@/app/hooks/stickman";
import { useEffect, useState } from "react";

function CalibrationView() {
  const imu = useSmoothedIMU();
  const [data, setData] = useState({ ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0 });
  const [snapshots, setSnapshots] = useState<{ label: string; ax: number; ay: number; az: number }[]>([]);

  useEffect(() => {
    const id = setInterval(() => {
      const d = imu.current;
      setData({ ax: d.ax, ay: d.ay, az: d.az, gx: d.gx, gy: d.gy, gz: d.gz });
    }, 50);
    return () => clearInterval(id);
  }, [imu]);

  const snap = (label: string) => {
    setSnapshots((s) => [...s, { label, ax: data.ax, ay: data.ay, az: data.az }]);
  };

  const barWidth = (v: number) => `${Math.min(Math.abs(v) * 50, 100)}%`;
  const barColor = (v: number) => (v > 0 ? "#4ade80" : "#f87171");

  return (
    <div className="min-h-screen bg-black text-white p-4 font-mono">
      <h1 className="text-xl mb-4">IMU Calibration</h1>
      <p className="text-zinc-400 text-sm mb-6">
        Place the device in each orientation and press the corresponding button.
        The axis that reads ~+1.0 is the one pointing UP.
      </p>

      {/* Live values */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(["ax", "ay", "az"] as const).map((k) => (
          <div key={k} className="bg-zinc-900 p-3 rounded">
            <div className="text-zinc-500 text-xs mb-1">{k}</div>
            <div className="text-2xl font-bold">{data[k].toFixed(3)}</div>
            <div className="h-2 bg-zinc-800 rounded mt-2 overflow-hidden">
              <div
                className="h-full rounded transition-all"
                style={{ width: barWidth(data[k]), backgroundColor: barColor(data[k]) }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Gyro */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(["gx", "gy", "gz"] as const).map((k) => (
          <div key={k} className="bg-zinc-900 p-3 rounded">
            <div className="text-zinc-500 text-xs mb-1">{k} (°/s)</div>
            <div className="text-lg">{data[k].toFixed(1)}</div>
          </div>
        ))}
      </div>

      {/* Orientation test buttons */}
      <div className="space-y-2 mb-6">
        <p className="text-zinc-400 text-sm">Snapshot current values for each pose:</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => snap("Flat (screen up)")} className="px-3 py-2 bg-blue-900 rounded text-sm hover:bg-blue-800">
            Flat (screen up)
          </button>
          <button onClick={() => snap("Standing (USB down)")} className="px-3 py-2 bg-blue-900 rounded text-sm hover:bg-blue-800">
            Standing (USB down)
          </button>
          <button onClick={() => snap("Tilted right")} className="px-3 py-2 bg-blue-900 rounded text-sm hover:bg-blue-800">
            Tilted right
          </button>
          <button onClick={() => snap("Tilted left")} className="px-3 py-2 bg-blue-900 rounded text-sm hover:bg-blue-800">
            Tilted left
          </button>
          <button onClick={() => snap("Screen down (face down)")} className="px-3 py-2 bg-blue-900 rounded text-sm hover:bg-blue-800">
            Screen down
          </button>
          <button onClick={() => snap("USB up (upside down)")} className="px-3 py-2 bg-blue-900 rounded text-sm hover:bg-blue-800">
            USB up
          </button>
        </div>
      </div>

      {/* Snapshots table */}
      {snapshots.length > 0 && (
        <div className="bg-zinc-900 rounded p-3">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm text-zinc-400">Snapshots</h2>
            <button onClick={() => setSnapshots([])} className="text-xs text-red-400 hover:text-red-300">Clear</button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-left">
                <th className="pb-1">Pose</th>
                <th className="pb-1 text-right">ax</th>
                <th className="pb-1 text-right">ay</th>
                <th className="pb-1 text-right">az</th>
                <th className="pb-1 text-right">Dominant</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s, i) => {
                const vals = [
                  { k: "ax", v: s.ax },
                  { k: "ay", v: s.ay },
                  { k: "az", v: s.az },
                ];
                const dominant = vals.reduce((a, b) => (Math.abs(b.v) > Math.abs(a.v) ? b : a));
                return (
                  <tr key={i} className="border-t border-zinc-800">
                    <td className="py-1">{s.label}</td>
                    <td className={`py-1 text-right ${dominant.k === "ax" ? "text-yellow-400 font-bold" : ""}`}>
                      {s.ax.toFixed(3)}
                    </td>
                    <td className={`py-1 text-right ${dominant.k === "ay" ? "text-yellow-400 font-bold" : ""}`}>
                      {s.ay.toFixed(3)}
                    </td>
                    <td className={`py-1 text-right ${dominant.k === "az" ? "text-yellow-400 font-bold" : ""}`}>
                      {s.az.toFixed(3)}
                    </td>
                    <td className="py-1 text-right text-yellow-400">
                      {dominant.k} = {dominant.v > 0 ? "+" : ""}{dominant.v.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {snapshots.length >= 3 && (
            <div className="mt-4 p-3 bg-zinc-800 rounded text-sm">
              <h3 className="text-zinc-300 mb-2">Axis Mapping Summary</h3>
              <p className="text-zinc-400">
                Based on your snapshots, copy the dominant axis values into the 3D viz mapping.
                The axis reading +1.0 when screen faces up should map to Three.js +Y (up).
              </p>
              <pre className="mt-2 text-green-400 text-xs">
{`// In Model3DViz.tsx, line ~205:
// Current: _upDir.set(o.gravityX, o.gravityZ, o.gravityY);
//
// If flat/screen-up shows: ax~0, ay~0, az~+1
//   → correct mapping: _upDir.set(gravityX, gravityZ, gravityY)
//   (devZ→threeY, devY→threeZ)
//
// If flat/screen-up shows: ax~0, ay~+1, az~0
//   → mapping should be: _upDir.set(gravityX, gravityY, gravityZ)
//   (devY→threeY, devZ→threeZ)`}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* 3D preview cube */}
      <div className="mt-6 bg-zinc-900 rounded p-4">
        <h2 className="text-sm text-zinc-400 mb-2">Live Orientation (current mapping)</h2>
        <div className="flex justify-center">
          <div
            className="w-32 h-32 border-2 border-zinc-600 rounded flex items-center justify-center text-4xl"
            style={{
              transform: `perspective(200px) rotateX(${-data.ay * 45}deg) rotateZ(${data.ax * 45}deg)`,
              transition: "transform 0.1s",
            }}
          >
            🎲
          </div>
        </div>
        <p className="text-center text-zinc-500 text-xs mt-2">
          If this cube doesn&apos;t match device tilt, the axis mapping is wrong
        </p>
      </div>
    </div>
  );
}

import { StickmanProvider } from "@/app/hooks/stickman";

export default function CalibratePage() {
  return (
    <StickmanProvider>
      <CalibrationView />
    </StickmanProvider>
  );
}
