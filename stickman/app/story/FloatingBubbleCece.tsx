"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

const BUBBLE_SPRITES = [
  "/images/story/split/s05-bubble-wave.png",
  "/images/story/split/s05-bubble-spin.png",
  "/images/story/split/s05-bubble-sleep.png",
  "/images/story/split/s05-bubble-laugh.png",
];

/**
 * Tiny bubble Cece floats around on smooth curved paths,
 * growing and shrinking, cycling through cute sprites.
 * Silly, playful feel.
 */
export function FloatingBubbleCece() {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [spriteIdx, setSpriteIdx] = useState(0);

  useEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const size = Math.min(vw, vh) * 0.15;

    // Start in the top area
    gsap.set(el, {
      x: vw * 0.5 - size / 2,
      y: vh * 0.1 - size / 2,
      scale: 0,
      opacity: 0,
      force3D: true,
    });

    // Pop in
    const tl = gsap.timeline();
    tl.to(el, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(2)" }, 0);

    // Float around on random curved paths — chain of tweens
    const floatLoop = () => {
      // Stay in the TOP area of screen to avoid characters in the center/bottom
      // Safe zone: x 10-90%, y 3-25% (above the character foreground)
      const tx = vw * (0.1 + Math.random() * 0.8) - size / 2;
      const ty = vh * (0.03 + Math.random() * 0.22) - size / 2;
      const dur = 2.5 + Math.random() * 2;
      const scaleTarget = 0.7 + Math.random() * 0.5; // 0.7 to 1.2
      const rot = (Math.random() - 0.5) * 12;

      gsap.to(el, {
        x: tx,
        y: ty,
        scale: scaleTarget,
        rotation: rot,
        duration: dur,
        ease: "sine.inOut",
        force3D: true,
        onComplete: floatLoop,
      });
    };

    // Start floating after pop-in
    tl.call(floatLoop, [], 0.8);

    // Cycle sprites every 2.5s
    const spriteInterval = setInterval(() => {
      setSpriteIdx((prev) => (prev + 1) % BUBBLE_SPRITES.length);
    }, 2500);

    return () => {
      tl.kill();
      gsap.killTweensOf(el);
      clearInterval(spriteInterval);
    };
  }, []);

  return (
    <div
      ref={bubbleRef}
      className="absolute z-[12] pointer-events-none"
      style={{
        width: `${Math.min(window.innerWidth, window.innerHeight) * 0.15}px`,
        height: `${Math.min(window.innerWidth, window.innerHeight) * 0.15}px`,
      }}
    >
      {BUBBLE_SPRITES.map((src, i) => (
        <img
          key={i}
          src={src}
          alt=""
          className="absolute inset-0 w-full h-full object-contain"
          style={{
            opacity: spriteIdx === i ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
        />
      ))}
      {/* Soft glow */}
      <div
        className="absolute -inset-3 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(255,215,0,0.2) 0%, transparent 70%)",
          animation: "fairyGlow 1.5s ease-in-out infinite alternate",
        }}
      />
    </div>
  );
}
