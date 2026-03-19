"use client";

import { useEffect, useRef, useState } from "react";
import { STORY_SLIDES } from "./slides";

interface StorySlideProps {
  lines: [string, string];
  imageSrc: string;
  index: number;
  isActive: boolean;
}

export function StorySlide({ lines, imageSrc, index, isActive }: StorySlideProps) {
  const [revealed, setRevealed] = useState(false);
  const [line1Text, setLine1Text] = useState("");
  const [line2Text, setLine2Text] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Typewriter effect when slide becomes active
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
          // Start line 2
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

  // Reset when leaving
  useEffect(() => {
    if (!isActive) {
      setRevealed(false);
      setLine1Text("");
      setLine2Text("");
    }
  }, [isActive]);

  return (
    <section
      className="h-[100dvh] w-full flex flex-col items-center justify-center relative snap-start snap-always"
      style={{ scrollSnapAlign: "start" }}
    >
      {/* Slide number */}
      <div className="absolute top-6 left-6 text-[10px] tracking-[0.3em] uppercase text-purple-400/40 font-mono">
        {index + 1} / {STORY_SLIDES.length}
      </div>

      {/* Image container */}
      <div
        className="relative w-[80vw] max-w-[500px] max-h-[50dvh] mb-8 rounded-2xl overflow-hidden flex items-center justify-center"
        style={{
          opacity: revealed ? 1 : 0,
          transform: revealed ? "scale(1)" : "scale(0.85)",
          transition: "opacity 0.8s ease-out, transform 1s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Glow behind image */}
        <div
          className="absolute -inset-4 rounded-3xl blur-2xl"
          style={{
            background: "radial-gradient(ellipse, rgba(168,85,247,0.25) 0%, rgba(59,130,246,0.1) 50%, transparent 80%)",
            opacity: revealed ? 1 : 0,
            transition: "opacity 1.5s ease-out",
          }}
        />
        {/* Image */}
        <img
          src={imageSrc}
          alt={`Story scene ${index + 1}`}
          className="relative w-full h-auto max-h-[50dvh] object-contain rounded-2xl"
          style={{
            boxShadow: "0 0 40px rgba(168,85,247,0.2), 0 0 80px rgba(59,130,246,0.1)",
          }}
        />
        {/* Sparkle overlay on image corners */}
        <div className="absolute inset-0 pointer-events-none rounded-2xl">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-white"
              style={{
                top: i < 2 ? "8%" : "88%",
                left: i % 2 === 0 ? "5%" : "92%",
                animation: `sparkle ${1.5 + i * 0.3}s ease-in-out infinite alternate`,
                animationDelay: `${i * 0.4}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Text container */}
      <div className="px-8 max-w-[600px] text-center">
        <p
          className="text-xl md:text-2xl leading-relaxed tracking-wide"
          style={{
            fontFamily: "var(--font-geist-sans)",
            color: "#e8dff5",
            textShadow: "0 0 20px rgba(168,85,247,0.3), 0 2px 4px rgba(0,0,0,0.5)",
            minHeight: "2em",
          }}
        >
          {line1Text}
          {line1Text.length > 0 && line1Text.length < lines[0].length && (
            <span className="inline-block w-[2px] h-[1.1em] bg-purple-300 align-middle ml-0.5 animate-pulse" />
          )}
        </p>
        <p
          className="text-xl md:text-2xl leading-relaxed tracking-wide mt-2"
          style={{
            fontFamily: "var(--font-geist-sans)",
            color: "#e8dff5",
            textShadow: "0 0 20px rgba(168,85,247,0.3), 0 2px 4px rgba(0,0,0,0.5)",
            minHeight: "2em",
          }}
        >
          {line2Text}
          {line2Text.length > 0 && line2Text.length < lines[1].length && (
            <span className="inline-block w-[2px] h-[1.1em] bg-purple-300 align-middle ml-0.5 animate-pulse" />
          )}
        </p>
      </div>
    </section>
  );
}
