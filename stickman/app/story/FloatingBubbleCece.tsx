"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { usePointer } from "@/app/hooks/stickman";

const BUBBLE_SPRITES = [
  "/images/story/split/s05-bubble-wave.png",
  "/images/story/split/s05-bubble-spin.png",
  "/images/story/split/s05-bubble-sleep.png",
  "/images/story/split/s05-bubble-laugh.png",
];

/**
 * Tiny bubble Cece pops out of the wand, floats around the top of the screen.
 * Wand input nudges the bubble's position — tilt the wand to push her around.
 * Falls back to autonomous floating when no wand input.
 */
export function FloatingBubbleCece() {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const pointer = usePointer();
  const [spriteIdx, setSpriteIdx] = useState(0);

  useEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bubbleSize = 160;
    const half = bubbleSize / 2;

    // Current bubble position (tracked for wand blending)
    const pos = { x: vw * 0.5 - half, y: vh * 0.4 - half };

    // Start at wand position, tiny
    gsap.set(el, {
      x: pos.x, y: pos.y,
      scaleX: 0, scaleY: 0, opacity: 0, force3D: true,
    });

    // Pop out of wand
    const entranceTl = gsap.timeline();
    entranceTl.to(el, {
      scaleX: 1, scaleY: 1, opacity: 1,
      duration: 0.8, ease: "back.out(2.5)",
    });
    entranceTl.to(el, {
      x: vw * 0.5 - half, y: vh * 0.12 - half,
      duration: 1.2, ease: "power2.out", force3D: true,
      onUpdate() { pos.x = gsap.getProperty(el, "x") as number; pos.y = gsap.getProperty(el, "y") as number; },
    }, 0.4);

    // After entrance: rAF loop blends autonomous float + wand input
    let animId = 0;
    let floatTarget = { x: vw * 0.5 - half, y: vh * 0.12 - half };
    let floatTimer = 0;
    let entranceDone = false;

    entranceTl.call(() => { entranceDone = true; }, [], 1.6);

    const pickNewTarget = () => {
      floatTarget = {
        x: vw * (0.12 + Math.random() * 0.76) - half,
        y: vh * (0.03 + Math.random() * 0.19) - half,
      };
    };
    pickNewTarget();

    const animate = () => {
      if (!entranceDone) { animId = requestAnimationFrame(animate); return; }

      // Pick a new float target every ~3.5s
      floatTimer++;
      if (floatTimer > 210) { // ~3.5s at 60fps
        pickNewTarget();
        floatTimer = 0;
      }

      // Wand influence: map pointer (-2..2) to screen offset
      const norm = pointer.current;
      const wandX = vw * 0.5 + norm.x * (vw * 0.3) - half;
      const wandY = vh * 0.12 + norm.y * (vh * 0.15) - half;
      const hasWandInput = Math.abs(norm.x) > 0.1 || Math.abs(norm.y) > 0.1;

      // Blend: if wand is active, follow wand; otherwise drift to float target
      const targetX = hasWandInput ? wandX : floatTarget.x;
      const targetY = hasWandInput ? wandY : floatTarget.y;
      const smoothing = hasWandInput ? 0.08 : 0.015; // wand is responsive, float is lazy

      pos.x += (targetX - pos.x) * smoothing;
      pos.y += (targetY - pos.y) * smoothing;

      // Clamp to safe zone (don't go over characters)
      pos.x = Math.max(-half, Math.min(vw - half, pos.x));
      pos.y = Math.max(vh * -0.02 - half, Math.min(vh * 0.25 - half, pos.y));

      gsap.set(el, { x: pos.x, y: pos.y, force3D: true });
      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);

    // Wobble as a single GSAP tween (not per-frame gsap.set)
    const wobbleTween = gsap.to(el, {
      scaleX: 0.9, scaleY: 1.1, rotation: 5,
      duration: 1.5, ease: "sine.inOut", yoyo: true, repeat: -1,
      force3D: true,
    });

    // Cycle sprites
    const spriteInterval = setInterval(() => {
      setSpriteIdx(prev => (prev + 1) % BUBBLE_SPRITES.length);
    }, 2500);

    return () => {
      entranceTl.kill();
      wobbleTween.kill();
      cancelAnimationFrame(animId);
      gsap.killTweensOf(el);
      clearInterval(spriteInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={bubbleRef}
      className="absolute z-[12] pointer-events-none"
      style={{ width: 160, height: 160 }}
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
