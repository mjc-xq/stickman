"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

const FAIRY_SPRITES = [
  "/images/story/fairy/fairy-fly-right.png",
  "/images/story/fairy/fairy-fly-up.png",
  "/images/story/fairy/fairy-dive.png",
  "/images/story/fairy/fairy-wave.png",
];

interface TrailDot { id: number; x: number; y: number; }

export function FairyFlight({ onComplete }: { onComplete?: () => void }) {
  const fairyRef = useRef<HTMLDivElement>(null);
  const [spriteIdx, setSpriteIdx] = useState(0);
  const [trail, setTrail] = useState<TrailDot[]>([]);
  const trailIdRef = useRef(0);

  useEffect(() => {
    const fairy = fairyRef.current;
    if (!fairy) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const size = Math.min(vw, vh) * 0.13;

    // Start off-screen right, hidden
    gsap.set(fairy, {
      x: vw + 50, y: vh * 0.15,
      scaleX: 0.5, scaleY: 0.5, // use explicit X/Y to avoid conflicts
      opacity: 1, force3D: true,
    });

    const tl = gsap.timeline({ onComplete });

    // Segment 1: Fly in from right to left side (fly-right sprite, flipped)
    tl.call(() => setSpriteIdx(0), [], 0);
    tl.to(fairy, {
      x: vw * 0.15 - size / 2,
      y: vh * 0.25 - size / 2,
      scaleX: -1, scaleY: 1, // negative X = flipped horizontally
      duration: 1.2, ease: "power1.out", force3D: true,
    }, 0);

    // Segment 2: Arc up to top center (fly-up sprite, unflipped)
    tl.call(() => setSpriteIdx(1), [], 1.2);
    tl.to(fairy, {
      x: vw * 0.5 - size / 2,
      y: vh * 0.06 - size / 2,
      scaleX: 1, scaleY: 1,
      duration: 1.0, ease: "sine.inOut", force3D: true,
    }, 1.2);

    // Segment 3: Wave at top (hold position)
    tl.call(() => setSpriteIdx(3), [], 2.2);

    // Segment 4: Dive into wand (dive sprite, shrinking)
    tl.call(() => setSpriteIdx(2), [], 2.8);
    tl.to(fairy, {
      x: vw * 0.48 - size / 2,
      y: vh * 0.38 - size / 2,
      scaleX: 0.12, scaleY: 0.12,
      duration: 1.0, ease: "power2.in", force3D: true,
    }, 2.8);

    // Segment 5: Disappear
    tl.to(fairy, { opacity: 0, duration: 0.2, ease: "power2.in" }, 3.7);

    // Sparkle trail
    const trailInterval = setInterval(() => {
      const rect = fairy.getBoundingClientRect();
      if (rect.width < 1) return;
      const id = trailIdRef.current++;
      setTrail(prev => [...prev.slice(-18), {
        id,
        x: rect.left + rect.width / 2 + (Math.random() - 0.5) * 10,
        y: rect.top + rect.height / 2 + (Math.random() - 0.5) * 10,
      }]);
    }, 70);

    return () => { tl.kill(); clearInterval(trailInterval); };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-30 pointer-events-none">
      {trail.map(dot => (
        <div key={dot.id} className="absolute rounded-full" style={{
          left: dot.x, top: dot.y,
          width: 3 + (dot.id % 3), height: 3 + (dot.id % 3),
          background: ["#ffd700", "#da70d6", "#fff", "#ff69b4"][dot.id % 4],
          boxShadow: `0 0 6px ${["#ffd700", "#da70d6", "#fff", "#ff69b4"][dot.id % 4]}`,
          animation: "fairyTrailFade 0.6s ease-out forwards",
        }} />
      ))}
      <div ref={fairyRef} className="absolute" style={{
        width: `${Math.min(window.innerWidth, window.innerHeight) * 0.13}px`,
        height: `${Math.min(window.innerWidth, window.innerHeight) * 0.13}px`,
      }}>
        {FAIRY_SPRITES.map((src, i) => (
          <img key={i} src={src} alt="" className="absolute inset-0 w-full h-full object-contain"
            style={{ opacity: spriteIdx === i ? 1 : 0, transition: "opacity 0.15s ease" }} />
        ))}
        <div className="absolute -inset-3 rounded-full" style={{
          background: "radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%)",
          animation: "fairyGlow 0.8s ease-in-out infinite alternate",
        }} />
      </div>
    </div>
  );
}
