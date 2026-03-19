"use client";

import { useEffect, useRef, useState } from "react";
import { STORY_SLIDES } from "./slides";

interface StorySlideProps {
  lines: [string, string];
  bgSrc: string;
  fgSrc: string;
  index: number;
  isActive: boolean;
  scrollProgress: number; // -1 to 1, 0 = centered in viewport
}

export function StorySlide({ lines, bgSrc, fgSrc, index, isActive, scrollProgress }: StorySlideProps) {
  const [revealed, setRevealed] = useState(false);
  const [line1Text, setLine1Text] = useState("");
  const [line2Text, setLine2Text] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Typewriter effect
  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;

    const startDelay = setTimeout(() => {
      if (cancelled) return;
      setRevealed(true);

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
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(startDelay);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isActive, lines]);

  useEffect(() => {
    if (!isActive) {
      setRevealed(false);
      setLine1Text("");
      setLine2Text("");
    }
  }, [isActive]);

  // Parallax offsets
  const bgOffset = scrollProgress * -30; // background moves slower (opposite)
  const fgOffset = scrollProgress * 15;  // foreground moves with scroll

  return (
    <section
      className="h-[100dvh] w-full relative snap-start snap-always overflow-hidden"
      style={{ scrollSnapAlign: "start" }}
    >
      {/* Slide number */}
      <div className="absolute top-4 left-4 text-[10px] tracking-[0.3em] uppercase text-purple-400/30 font-mono z-20">
        {index + 1} / {STORY_SLIDES.length}
      </div>

      {/* Background layer (parallax - moves slower) */}
      <div
        className="absolute inset-0 z-0"
        style={{
          transform: `translateY(${bgOffset}px) scale(1.15)`,
          willChange: "transform",
        }}
      >
        <img
          src={bgSrc}
          alt=""
          className="w-full h-full object-cover"
          style={{ opacity: revealed ? 0.7 : 0, transition: "opacity 1.2s ease-out" }}
        />
        {/* Darken overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />
      </div>

      {/* Foreground characters layer (parallax - slight float) */}
      <div
        className="absolute inset-0 flex items-center justify-center z-10"
        style={{
          transform: `translateY(${fgOffset}px)`,
          willChange: "transform",
        }}
      >
        <div
          className="relative w-[70vw] max-w-[450px] max-h-[45dvh]"
          style={{
            opacity: revealed ? 1 : 0,
            transform: revealed ? "scale(1) translateY(-5%)" : "scale(0.85) translateY(10%)",
            transition: "opacity 0.8s ease-out 0.3s, transform 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.3s",
          }}
        >
          {/* Glow behind characters */}
          <div
            className="absolute -inset-8 rounded-full blur-3xl"
            style={{
              background: "radial-gradient(ellipse, rgba(168,85,247,0.3) 0%, rgba(59,130,246,0.15) 40%, transparent 70%)",
              opacity: revealed ? 1 : 0,
              transition: "opacity 2s ease-out",
            }}
          />
          <img
            src={fgSrc}
            alt={`Story scene ${index + 1}`}
            className="relative w-full h-auto max-h-[45dvh] object-contain drop-shadow-2xl"
            style={{
              filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.5)) drop-shadow(0 0 40px rgba(168,85,247,0.2))",
            }}
          />
        </div>
      </div>

      {/* Text container - bigger text, positioned at bottom */}
      <div className="absolute bottom-8 inset-x-0 z-20 px-6">
        <div className="max-w-[700px] mx-auto text-center">
          <p
            className="text-2xl md:text-4xl leading-snug tracking-wide font-medium"
            style={{
              color: "#f0e8ff",
              textShadow: "0 0 30px rgba(168,85,247,0.4), 0 2px 8px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.5)",
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
              color: "#f0e8ff",
              textShadow: "0 0 30px rgba(168,85,247,0.4), 0 2px 8px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.5)",
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
