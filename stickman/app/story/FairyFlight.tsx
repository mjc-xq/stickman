"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

const FAIRY_SPRITES = [
  "/images/story/fairy/fairy-fly-right.png",
  "/images/story/fairy/fairy-fly-up.png",
  "/images/story/fairy/fairy-dive.png",
  "/images/story/fairy/fairy-wave.png",
];

interface TrailDot {
  id: number;
  x: number;
  y: number;
}

/**
 * Fairy Cece enters from off-screen, does one dramatic swoop, then
 * shrinks and disappears into the wand (center of screen).
 */
export function FairyFlight({ onComplete }: { onComplete?: () => void }) {
  const fairyRef = useRef<HTMLDivElement>(null);
  const [spriteIndex, setSpriteIndex] = useState(0);
  const [trail, setTrail] = useState<TrailDot[]>([]);
  const trailIdRef = useRef(0);

  useEffect(() => {
    const fairy = fairyRef.current;
    if (!fairy) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fairySize = Math.min(vw, vh) * 0.13;
    // Wand position (where Cece holds it — center-ish, slightly above middle)
    const wandX = vw * 0.5;
    const wandY = vh * 0.4;

    // Flight: enter from top-right → swoop down-left → arc up → dive into wand
    const tl = gsap.timeline();

    // Start off-screen top-right
    gsap.set(fairy, {
      x: vw + 50,
      y: -50,
      scale: 0.4,
      opacity: 1,
      force3D: true,
    });

    // 1. Fly in from top-right, growing, swooping down to center-left
    tl.call(() => setSpriteIndex(0), [], 0); // fly-right (entering from right)
    tl.to(fairy, {
      x: vw * 0.2 - fairySize / 2,
      y: vh * 0.3 - fairySize / 2,
      scale: 1,
      duration: 1.2,
      ease: "power1.inOut",
      force3D: true,
    }, 0);
    tl.to(fairy, { scaleX: -1, duration: 0.01 }, 0); // flying left (flipped)

    // 2. Arc up to top-center
    tl.call(() => setSpriteIndex(1), [], 1.2); // fly-up
    tl.to(fairy, { scaleX: 1, duration: 0.15 }, 1.2); // unflip
    tl.to(fairy, {
      x: vw * 0.5 - fairySize / 2,
      y: vh * 0.08 - fairySize / 2,
      duration: 1.0,
      ease: "power1.inOut",
      force3D: true,
    }, 1.2);

    // 3. Quick wave at the top
    tl.call(() => setSpriteIndex(3), [], 2.2); // wave
    tl.to({}, { duration: 0.5 }, 2.2); // pause to wave

    // 4. Dive into the wand — shrinking as she goes
    tl.call(() => setSpriteIndex(2), [], 2.7); // dive
    tl.to(fairy, {
      x: wandX - fairySize / 2,
      y: wandY - fairySize / 2,
      scale: 0.15,
      duration: 1.0,
      ease: "power2.in",
      force3D: true,
    }, 2.7);

    // 5. Final flash and disappear
    tl.to(fairy, {
      opacity: 0,
      scale: 0,
      duration: 0.3,
      ease: "power3.in",
      onComplete,
    }, 3.6);

    // Sparkle trail: drop dots every 60ms while flying
    let trailInterval: ReturnType<typeof setInterval> | null = null;
    trailInterval = setInterval(() => {
      if (!fairy) return;
      const rect = fairy.getBoundingClientRect();
      if (rect.width === 0) return;
      const id = trailIdRef.current++;
      setTrail((prev) => [...prev.slice(-20), {
        id,
        x: rect.left + rect.width / 2 + (Math.random() - 0.5) * 12,
        y: rect.top + rect.height / 2 + (Math.random() - 0.5) * 12,
      }]);
    }, 60);

    return () => {
      tl.kill();
      if (trailInterval) clearInterval(trailInterval);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-30 pointer-events-none">
      {/* Sparkle trail */}
      {trail.map((dot) => (
        <div
          key={dot.id}
          className="absolute rounded-full"
          style={{
            left: dot.x,
            top: dot.y,
            width: 3 + (dot.id % 4),
            height: 3 + (dot.id % 4),
            background: ["#ffd700", "#da70d6", "#fff", "#ff69b4"][dot.id % 4],
            boxShadow: `0 0 6px ${["#ffd700", "#da70d6", "#fff", "#ff69b4"][dot.id % 4]}`,
            animation: "fairyTrailFade 0.6s ease-out forwards",
          }}
        />
      ))}

      {/* Fairy sprite */}
      <div
        ref={fairyRef}
        className="absolute"
        style={{
          width: `${Math.min(window.innerWidth, window.innerHeight) * 0.13}px`,
          height: `${Math.min(window.innerWidth, window.innerHeight) * 0.13}px`,
        }}
      >
        {FAIRY_SPRITES.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
            style={{
              opacity: spriteIndex === i ? 1 : 0,
              transition: "opacity 0.12s ease",
            }}
          />
        ))}
        {/* Glow */}
        <div
          className="absolute -inset-3 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(255,215,0,0.35) 0%, rgba(218,112,214,0.15) 50%, transparent 70%)",
            animation: "fairyGlow 0.8s ease-in-out infinite alternate",
          }}
        />
      </div>
    </div>
  );
}
