"use client";

import { useEffect, useRef, useState, useMemo } from "react";
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

export function FairyFlight({ onComplete }: { onComplete?: () => void }) {
  const fairyRef = useRef<HTMLDivElement>(null);
  const [spriteIdx, setSpriteIdx] = useState(0);
  const [trail, setTrail] = useState<TrailDot[]>([]);
  const trailIdRef = useRef(0);
  const trailBufferRef = useRef<TrailDot[]>([]);

  // Memoize size so it doesn't recalculate on every render
  const size = useMemo(() => {
    if (typeof window === "undefined") return 60;
    return Math.min(window.innerWidth, window.innerHeight) * 0.13;
  }, []);

  useEffect(() => {
    const fairy = fairyRef.current;
    if (!fairy) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // ---------------------------------------------------------------
    // Initial position: off-screen right, already flipped left and
    // at full scale. This avoids the scale 0.5 -> -1 jump that was
    // causing the stutter. The fairy flies LEFT, so scaleX is -1
    // (horizontally flipped) from the start.
    // ---------------------------------------------------------------
    gsap.set(fairy, {
      x: vw + 50,
      y: vh * 0.15,
      scaleX: -1,
      scaleY: 1,
      opacity: 1,
      force3D: true,
    });

    const tl = gsap.timeline({ onComplete });

    // ---------------------------------------------------------------
    // Segment 1 — Fly in from right to left (fly-right sprite, flipped)
    // spriteIdx defaults to 0, no need to setSpriteIdx here.
    // Only position changes — scale is already correct.
    // ---------------------------------------------------------------
    tl.to(
      fairy,
      {
        x: vw * 0.15 - size / 2,
        y: vh * 0.25 - size / 2,
        duration: 1.2,
        ease: "power1.out",
        force3D: true,
      },
      0,
    );

    // ---------------------------------------------------------------
    // Segment 2 — Arc up to top center (fly-up sprite, unflipped)
    // Flip back to scaleX: 1 gradually as the fairy arcs upward.
    // Splitting the flip into its own tween so position and flip
    // don't fight each other.
    // ---------------------------------------------------------------
    tl.call(() => setSpriteIdx(1), [], 1.15);
    tl.to(
      fairy,
      {
        x: vw * 0.5 - size / 2,
        y: vh * 0.06 - size / 2,
        duration: 1.0,
        ease: "sine.inOut",
        force3D: true,
      },
      1.2,
    );
    // Unflip scaleX smoothly over the first half of the arc
    tl.to(
      fairy,
      {
        scaleX: 1,
        duration: 0.5,
        ease: "sine.inOut",
      },
      1.2,
    );

    // ---------------------------------------------------------------
    // Segment 3 — Wave at top (hold position briefly)
    // ---------------------------------------------------------------
    tl.call(() => setSpriteIdx(3), [], 2.2);

    // ---------------------------------------------------------------
    // Segment 4 — Dive into wand center (dive sprite, shrinking)
    // ---------------------------------------------------------------
    tl.call(() => setSpriteIdx(2), [], 2.8);
    tl.to(
      fairy,
      {
        x: vw * 0.48 - size / 2,
        y: vh * 0.38 - size / 2,
        scaleX: 0.12,
        scaleY: 0.12,
        duration: 1.0,
        ease: "power2.in",
        force3D: true,
      },
      2.8,
    );

    // ---------------------------------------------------------------
    // Segment 5 — Fade out
    // ---------------------------------------------------------------
    tl.to(fairy, { opacity: 0, duration: 0.2, ease: "power2.in" }, 3.7);

    // ---------------------------------------------------------------
    // Sparkle trail — buffer dots and flush to React state every 200ms
    // so we don't trigger a re-render every 70ms which can interrupt
    // GSAP on slower devices.
    // ---------------------------------------------------------------
    const trailInterval = setInterval(() => {
      const rect = fairy.getBoundingClientRect();
      if (rect.width < 1) return;
      const id = trailIdRef.current++;
      trailBufferRef.current.push({
        id,
        x: rect.left + rect.width / 2 + (Math.random() - 0.5) * 10,
        y: rect.top + rect.height / 2 + (Math.random() - 0.5) * 10,
      });
    }, 70);

    const flushInterval = setInterval(() => {
      if (trailBufferRef.current.length === 0) return;
      const newDots = trailBufferRef.current.splice(0);
      setTrail((prev) => [...prev, ...newDots].slice(-18));
    }, 200);

    return () => {
      tl.kill();
      clearInterval(trailInterval);
      clearInterval(flushInterval);
    };
  }, [onComplete, size]);

  return (
    <div className="fixed inset-0 z-30 pointer-events-none">
      {trail.map((dot) => (
        <div
          key={dot.id}
          className="absolute rounded-full"
          style={{
            left: dot.x,
            top: dot.y,
            width: 3 + (dot.id % 3),
            height: 3 + (dot.id % 3),
            background: ["#ffd700", "#da70d6", "#fff", "#ff69b4"][dot.id % 4],
            boxShadow: `0 0 6px ${["#ffd700", "#da70d6", "#fff", "#ff69b4"][dot.id % 4]}`,
            animation: "fairyTrailFade 0.6s ease-out forwards",
          }}
        />
      ))}
      <div
        ref={fairyRef}
        className="absolute"
        style={{ width: `${size}px`, height: `${size}px` }}
      >
        {FAIRY_SPRITES.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
            style={{
              opacity: spriteIdx === i ? 1 : 0,
              transition: "opacity 0.15s ease",
            }}
          />
        ))}
        <div
          className="absolute -inset-3 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%)",
            animation: "fairyGlow 0.8s ease-in-out infinite alternate",
          }}
        />
      </div>
    </div>
  );
}
