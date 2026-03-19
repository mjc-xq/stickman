"use client";

import { useEffect, useRef, useState } from "react";
import { STORY_SLIDES } from "./slides";

interface StorySlideProps {
  lines: [string, string];
  bgSrc: string;
  fgSrc: string;
  index: number;
  isActive: boolean;
}

export function StorySlide({ lines, bgSrc, fgSrc, index, isActive }: StorySlideProps) {
  const [phase, setPhase] = useState<"hidden" | "bg" | "fg" | "text">("hidden");
  const [line1Text, setLine1Text] = useState("");
  const [line2Text, setLine2Text] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Staggered entrance: bg → fg slides up → text types in
  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;

    // Phase 1: background fades in immediately
    setPhase("bg");

    // Phase 2: foreground slides up after 0.6s
    const fgTimer = setTimeout(() => {
      if (!cancelled) setPhase("fg");
    }, 600);

    // Phase 3: text starts typing after fg settles (1.5s)
    const textTimer = setTimeout(() => {
      if (cancelled) return;
      setPhase("text");

      let i = 0;
      const fullLine1 = lines[0];
      const fullLine2 = lines[1];

      const type = () => {
        if (cancelled) return;
        if (i <= fullLine1.length) {
          setLine1Text(fullLine1.slice(0, i));
          i++;
          timerRef.current = setTimeout(type, 35);
        } else {
          let j = 0;
          const typeLine2 = () => {
            if (cancelled) return;
            if (j <= fullLine2.length) {
              setLine2Text(fullLine2.slice(0, j));
              j++;
              timerRef.current = setTimeout(typeLine2, 35);
            }
          };
          timerRef.current = setTimeout(typeLine2, 200);
        }
      };
      type();
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(fgTimer);
      clearTimeout(textTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isActive, lines]);

  // Reset when leaving
  useEffect(() => {
    if (!isActive) {
      setPhase("hidden");
      setLine1Text("");
      setLine2Text("");
    }
  }, [isActive]);

  const fgVisible = phase === "fg" || phase === "text";
  const textVisible = phase === "text";

  return (
    <section
      className="h-[100dvh] w-full relative snap-start snap-always overflow-hidden"
      style={{ scrollSnapAlign: "start" }}
    >
      {/* Slide number */}
      <div className="absolute top-4 left-4 text-[10px] tracking-[0.3em] uppercase text-purple-400/30 font-mono z-20">
        {index + 1} / {STORY_SLIDES.length}
      </div>

      {/* Background layer — fades in first */}
      <div className="absolute inset-0 z-0">
        <img
          src={bgSrc}
          alt=""
          className="w-full h-full object-cover"
          style={{ opacity: 0.75 }}
        />
        {/* Darken bottom for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/70" />
      </div>

      {/* Foreground characters — slides up from below with slight 3D float */}
      <div
        className="absolute inset-0 flex items-center justify-center z-10 overflow-hidden"
        style={{ perspective: "1200px" }}
      >
        <div
          className="relative w-[90vw] max-w-[600px] max-h-[55dvh]"
          style={{
            transform: fgVisible
              ? "translateY(0) translateZ(30px) rotateX(1deg)"
              : "translateY(150vh)",
            transition: fgVisible ? "transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
          }}
        >
          {/* Glow behind characters */}
          <div
            className="absolute -inset-8 rounded-full blur-3xl"
            style={{
              background: "radial-gradient(ellipse, rgba(168,85,247,0.3) 0%, rgba(59,130,246,0.15) 40%, transparent 70%)",
            }}
          />
          <img
            src={fgSrc}
            alt={`Story scene ${index + 1}`}
            className="relative w-full h-auto max-h-[55dvh] object-contain"
            style={{
              filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.5)) drop-shadow(0 0 40px rgba(168,85,247,0.2))",
            }}
          />
        </div>
      </div>

      {/* Text — appears last, at bottom */}
      <div
        className="absolute bottom-8 inset-x-0 z-20 px-6"
        style={{
          transform: textVisible ? "translateY(0)" : "translateY(30px)",
          transition: "transform 0.5s ease-out",
        }}
      >
        <div className="max-w-[700px] mx-auto text-center">
          <p
            className="text-3xl md:text-4xl leading-snug tracking-wide font-bold"
            style={{
              color: "#ffffff",
              textShadow: "0 2px 4px rgba(0,0,0,1), 0 0 20px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.6), 0 0 10px rgba(168,85,247,0.3)",
              minHeight: "1.5em",
            }}
          >
            {line1Text}
            {line1Text.length > 0 && line1Text.length < lines[0].length && (
              <span className="inline-block w-[2px] h-[1.1em] bg-purple-300 align-middle ml-0.5 animate-pulse" />
            )}
          </p>
          <p
            className="text-2xl md:text-4xl leading-snug tracking-wide font-medium mt-2"
            style={{
              color: "#ffffff",
              textShadow: "0 2px 4px rgba(0,0,0,1), 0 0 20px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.6), 0 0 10px rgba(168,85,247,0.3)",
              minHeight: "1.5em",
            }}
          >
            {line2Text}
            {line2Text.length > 0 && line2Text.length < lines[1].length && (
              <span className="inline-block w-[2px] h-[1.1em] bg-purple-300 align-middle ml-0.5 animate-pulse" />
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
