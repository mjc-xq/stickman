"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

const FAIRY_SPRITES = [
  "/images/story/fairy/fairy-fly-right.png",
  "/images/story/fairy/fairy-fly-up.png",
  "/images/story/fairy/fairy-dive.png",
  "/images/story/fairy/fairy-wave.png",
];

// Sparkle trail dot
interface TrailDot {
  id: number;
  x: number;
  y: number;
}

/**
 * Fairy Cece flies around the screen on a magical path, then dives into the wand.
 * Cycles through sprite frames while flying. Leaves sparkle trail.
 */
export function FairyFlight({ onComplete }: { onComplete?: () => void }) {
  const fairyRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [spriteIndex, setSpriteIndex] = useState(0);
  const [trail, setTrail] = useState<TrailDot[]>([]);
  const trailIdRef = useRef(0);

  useEffect(() => {
    const fairy = fairyRef.current;
    if (!fairy) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Size the fairy
    const fairySize = Math.min(vw, vh) * 0.12;

    // Flight waypoints — a dramatic loop around the screen
    // Start from center (where the wand is), swoop around, come back
    const waypoints = [
      // Start: center of screen (near the wand)
      { x: vw * 0.5, y: vh * 0.45, sprite: 3, dur: 0 },       // wave at viewer
      // Swoop up and right
      { x: vw * 0.8, y: vh * 0.2, sprite: 0, dur: 1.2 },       // fly right
      // Arc across the top
      { x: vw * 0.5, y: vh * 0.08, sprite: 1, dur: 1.0 },      // fly up at peak
      // Dive down left
      { x: vw * 0.15, y: vh * 0.4, sprite: 2, dur: 0.9 },      // dive
      // Swoop back up and wave
      { x: vw * 0.3, y: vh * 0.15, sprite: 1, dur: 0.8 },      // fly up
      // Big swoop across to right
      { x: vw * 0.85, y: vh * 0.35, sprite: 0, dur: 1.1 },     // fly right
      // Loop over the top
      { x: vw * 0.6, y: vh * 0.05, sprite: 1, dur: 0.8 },      // fly up
      // Wave at viewer at top center
      { x: vw * 0.5, y: vh * 0.12, sprite: 3, dur: 0.6 },      // wave
      // Final dive back to wand center
      { x: vw * 0.5, y: vh * 0.42, sprite: 2, dur: 1.0 },      // dive into wand
    ];

    // Build the GSAP timeline
    const tl = gsap.timeline({
      onComplete: () => {
        // Shrink into wand
        gsap.to(fairy, {
          scale: 0, opacity: 0, duration: 0.5, ease: "power2.in",
          onComplete,
        });
      },
    });

    // Set initial position
    gsap.set(fairy, {
      x: waypoints[0].x - fairySize / 2,
      y: waypoints[0].y - fairySize / 2,
      scale: 0,
      opacity: 0,
      force3D: true,
    });

    // Pop in with a sparkle
    tl.to(fairy, {
      scale: 1, opacity: 1,
      duration: 0.5, ease: "back.out(2)",
    }, 0);

    // Pause to wave
    tl.to({}, { duration: 0.6 }, 0.5);

    // Fly through each waypoint
    let time = 1.1;
    for (let i = 1; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const prevWp = waypoints[i - 1];

      // Determine if flying left (flip sprite)
      const goingLeft = wp.x < prevWp.x;

      // Set sprite at start of each segment
      tl.call(() => {
        setSpriteIndex(wp.sprite);
      }, [], time);

      // Flip fairy based on direction
      tl.to(fairy, {
        scaleX: goingLeft ? -1 : 1,
        duration: 0.15,
        ease: "power1.inOut",
      }, time);

      // Move to waypoint with a curved feel (overshoot ease)
      tl.to(fairy, {
        x: wp.x - fairySize / 2,
        y: wp.y - fairySize / 2,
        duration: wp.dur,
        ease: i === waypoints.length - 1 ? "power2.in" : "power1.inOut",
        force3D: true,
      }, time);

      time += wp.dur;
    }

    // Sparkle trail: poll fairy position every 80ms and drop dots
    let trailInterval: ReturnType<typeof setInterval> | null = null;
    const startTrail = () => {
      trailInterval = setInterval(() => {
        if (!fairy) return;
        const rect = fairy.getBoundingClientRect();
        if (rect.width === 0) return;
        const id = trailIdRef.current++;
        const dot: TrailDot = {
          id,
          x: rect.left + rect.width / 2 + (Math.random() - 0.5) * 10,
          y: rect.top + rect.height / 2 + (Math.random() - 0.5) * 10,
        };
        setTrail((prev) => [...prev.slice(-25), dot]); // keep last 25 dots
      }, 80);
    };

    // Start trail after pop-in
    const trailTimer = setTimeout(startTrail, 600);

    return () => {
      tl.kill();
      if (trailInterval) clearInterval(trailInterval);
      clearTimeout(trailTimer);
    };
  }, [onComplete]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-30 pointer-events-none">
      {/* Sparkle trail */}
      {trail.map((dot) => (
        <div
          key={dot.id}
          className="absolute rounded-full"
          style={{
            left: dot.x,
            top: dot.y,
            width: 4 + Math.random() * 4,
            height: 4 + Math.random() * 4,
            background: ["#ffd700", "#da70d6", "#fff", "#ff69b4"][dot.id % 4],
            boxShadow: `0 0 6px ${["#ffd700", "#da70d6", "#fff", "#ff69b4"][dot.id % 4]}`,
            animation: "fairyTrailFade 0.8s ease-out forwards",
          }}
        />
      ))}

      {/* The fairy sprite */}
      <div
        ref={fairyRef}
        className="absolute"
        style={{
          width: `${Math.min(window.innerWidth, window.innerHeight) * 0.12}px`,
          height: `${Math.min(window.innerWidth, window.innerHeight) * 0.12}px`,
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
              transition: "opacity 0.15s ease",
            }}
          />
        ))}
        {/* Glow around fairy */}
        <div
          className="absolute -inset-4 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(255,215,0,0.3) 0%, rgba(218,112,214,0.15) 50%, transparent 70%)",
            animation: "fairyGlow 1s ease-in-out infinite alternate",
          }}
        />
      </div>
    </div>
  );
}
