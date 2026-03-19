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
 * Tiny bubble Cece pops out of the wand area, floats around the top
 * of the screen with bubbly bobbing motion, cycles sprites.
 * Stays visible until slide changes (parent unmounts this component).
 */
export function FloatingBubbleCece() {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [spriteIdx, setSpriteIdx] = useState(0);

  useEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Start at wand position (center of screen) at tiny scale
    gsap.set(el, {
      x: vw * 0.5 - 40,
      y: vh * 0.4 - 40,
      scaleX: 0, scaleY: 0,
      opacity: 0,
      force3D: true,
    });

    // Pop out of wand with a bounce
    const entranceTl = gsap.timeline();
    entranceTl.to(el, {
      scaleX: 1, scaleY: 1, opacity: 1,
      duration: 0.8, ease: "back.out(2.5)",
    });
    // Float up to the safe zone (top of screen)
    entranceTl.to(el, {
      x: vw * 0.5 - 40,
      y: vh * 0.1 - 40,
      duration: 1.2, ease: "power2.out", force3D: true,
    }, 0.4);

    // After entrance, start floating randomly in top zone
    let floatTween: gsap.core.Tween | null = null;
    const floatLoop = () => {
      // Bubbly path: top area only (3-22% of screen height)
      const tx = vw * (0.12 + Math.random() * 0.76) - 40;
      const ty = vh * (0.03 + Math.random() * 0.19) - 40;
      const dur = 3 + Math.random() * 2;

      floatTween = gsap.to(el, {
        x: tx, y: ty,
        scaleX: 0.75 + Math.random() * 0.4,
        scaleY: 0.75 + Math.random() * 0.4,
        rotation: (Math.random() - 0.5) * 10,
        duration: dur,
        ease: "sine.inOut",
        force3D: true,
        onComplete: floatLoop,
      });
    };

    entranceTl.call(floatLoop, [], 1.6);

    // Cycle sprites
    const spriteInterval = setInterval(() => {
      setSpriteIdx(prev => (prev + 1) % BUBBLE_SPRITES.length);
    }, 2500);

    return () => {
      entranceTl.kill();
      if (floatTween) floatTween.kill();
      gsap.killTweensOf(el);
      clearInterval(spriteInterval);
    };
  }, []);

  return (
    <div
      ref={bubbleRef}
      className="absolute z-[12] pointer-events-none"
      style={{ width: 80, height: 80 }}
    >
      {BUBBLE_SPRITES.map((src, i) => (
        <img key={i} src={src} alt="" className="absolute inset-0 w-full h-full object-contain"
          style={{ opacity: spriteIdx === i ? 1 : 0, transition: "opacity 0.3s ease" }} />
      ))}
      <div className="absolute -inset-2 rounded-full" style={{
        background: "radial-gradient(circle, rgba(255,215,0,0.2) 0%, transparent 70%)",
        animation: "fairyGlow 1.5s ease-in-out infinite alternate",
      }} />
    </div>
  );
}
