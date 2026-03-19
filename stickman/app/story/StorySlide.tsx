"use client";

import { useEffect, useRef, useState } from "react";
import { STORY_SLIDES, type Slide } from "./slides";

interface StorySlideProps {
  lines: [string, string];
  bgSrc: string;
  fgSrc: string;
  index: number;
  isActive: boolean;
  effect?: Slide["effect"];
  effectTriggerWord?: string;
}

export function StorySlide({ lines, bgSrc, fgSrc, index, isActive, effect, effectTriggerWord }: StorySlideProps) {
  const [phase, setPhase] = useState<"hidden" | "bg" | "fg" | "text">("hidden");
  const [line1Text, setLine1Text] = useState("");
  const [line2Text, setLine2Text] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showEffect, setShowEffect] = useState(false);
  const effectFiredRef = useRef(false);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;

    setPhase("bg");
    effectFiredRef.current = false;

    // Effects without a trigger word fire early; word-triggered effects fire from the typewriter
    let effectTimer: ReturnType<typeof setTimeout> | undefined;
    if (effect && !effectTriggerWord) {
      effectTimer = setTimeout(() => {
        if (!cancelled) setShowEffect(true);
      }, 300);
    }

    const fgTimer = setTimeout(() => {
      if (!cancelled) setPhase("fg");
    }, 800);

    const textTimer = setTimeout(() => {
      if (cancelled) return;
      setPhase("text");

      let i = 0;
      const fullLine1 = lines[0];
      const fullLine2 = lines[1];

      const type = () => {
        if (cancelled) return;
        if (i <= fullLine1.length) {
          const currentText = fullLine1.slice(0, i);
          setLine1Text(currentText);
          // Fire effect when trigger word appears
          if (effectTriggerWord && !effectFiredRef.current && currentText.includes(effectTriggerWord)) {
            effectFiredRef.current = true;
            setShowEffect(true);
          }
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
    }, 1800);

    return () => {
      cancelled = true;
      if (effectTimer) clearTimeout(effectTimer);
      clearTimeout(fgTimer);
      clearTimeout(textTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isActive, lines]);

  useEffect(() => {
    if (!isActive) {
      setPhase("hidden");
      setLine1Text("");
      setLine2Text("");
      setShowEffect(false);
    }
  }, [isActive]);

  const bgActive = phase !== "hidden";
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

      {/* Background — GPU-accelerated zoom-in from 1.15 → 1.05 (Ken Burns lite) */}
      <div
        className="absolute inset-0 z-0"
        style={{
          transform: bgActive
            ? "translate3d(0,0,0) scale(1.05)"
            : "translate3d(0,0,0) scale(1.15)",
          transition: bgActive
            ? "transform 8s cubic-bezier(0.25, 0.1, 0.25, 1)"
            : "none",
          willChange: "transform",
        }}
      >
        <img
          src={bgSrc}
          alt=""
          className="w-full h-full object-cover"
          loading={index === 0 ? "eager" : "lazy"}
          style={{ opacity: 0.8 }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/70" />
      </div>

      {/* Per-slide effects */}
      {showEffect && effect === "shooting-star" && <ShootingStarEffect />}
      {showEffect && effect === "flash" && <FlashEffect />}
      {showEffect && effect === "sparkle-burst" && <SparkleBurstEffect />}

      {/* Foreground — GPU-accelerated slide up from below viewport */}
      <div
        className="absolute inset-0 flex items-center justify-center z-10"
        style={{ perspective: "1000px" }}
      >
        <div
          style={{
            width: "90vw",
            maxWidth: "600px",
            maxHeight: "55dvh",
            transform: fgVisible
              ? "translate3d(0, 0, 40px) rotateX(0.5deg)"
              : "translate3d(0, 100vh, 0)",
            transition: fgVisible
              ? "transform 1s cubic-bezier(0.34, 1.56, 0.64, 1)"
              : "none",
            willChange: "transform",
          }}
        >
          {/* Glow */}
          <div
            className="absolute -inset-8 rounded-full blur-3xl"
            style={{
              background: "radial-gradient(ellipse, rgba(168,85,247,0.3) 0%, rgba(59,130,246,0.15) 40%, transparent 70%)",
            }}
          />
          <img
            src={fgSrc}
            alt={`Story scene ${index + 1}`}
            loading={index === 0 ? "eager" : "lazy"}
            className="relative w-full h-auto object-contain"
            style={{
              maxHeight: "55dvh",
              filter: "drop-shadow(0 8px 30px rgba(0,0,0,0.6)) drop-shadow(0 0 60px rgba(168,85,247,0.15))",
            }}
          />
        </div>
      </div>

      {/* Text at bottom — slides up */}
      <div
        className="absolute bottom-8 inset-x-0 z-20 px-6"
        style={{
          transform: textVisible
            ? "translate3d(0, 0, 0)"
            : "translate3d(0, 40px, 0)",
          opacity: textVisible ? 1 : 0,
          transition: textVisible
            ? "transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease-out"
            : "none",
          willChange: "transform, opacity",
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
            className="text-3xl md:text-4xl leading-snug tracking-wide font-bold mt-2"
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

/** Shooting star streaks across the slide */
function ShootingStarEffect() {
  return (
    <div className="absolute inset-0 z-[5] pointer-events-none overflow-hidden">
      <div
        className="absolute"
        style={{
          top: "15%",
          left: "10%",
          width: "200px",
          height: "2px",
          background: "linear-gradient(to right, transparent, rgba(255,215,0,0.9), #ffd700, white)",
          borderRadius: "2px",
          boxShadow: "0 0 12px rgba(255,215,0,0.8), 0 0 30px rgba(255,215,0,0.4)",
          animation: "slideShootingStar 2s ease-out forwards",
        }}
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            top: `${14 + Math.sin(i * 1.2) * 3}%`,
            left: "10%",
            width: "4px",
            height: "4px",
            background: "#ffd700",
            boxShadow: "0 0 8px #ffd700",
            animation: `slideShootingStar 2s ease-out ${0.1 + i * 0.08}s forwards`,
            opacity: 1 - i * 0.15,
          }}
        />
      ))}
    </div>
  );
}

/** Quick white flash */
function FlashEffect() {
  return (
    <div
      className="absolute inset-0 z-[5] pointer-events-none"
      style={{
        background: "white",
        animation: "flashBang 0.6s ease-out forwards",
      }}
    />
  );
}

/** Sparkle burst from center */
function SparkleBurstEffect() {
  return (
    <div className="absolute inset-0 z-[5] pointer-events-none flex items-center justify-center">
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * 360;
        return (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: "4px",
              height: "4px",
              background: i % 3 === 0 ? "#ffd700" : i % 3 === 1 ? "#da70d6" : "#ffffff",
              boxShadow: `0 0 8px ${i % 3 === 0 ? "#ffd700" : i % 3 === 1 ? "#da70d6" : "#ffffff"}`,
              animation: `sparkleBurst 1.2s ease-out ${i * 0.05}s forwards`,
              transform: `rotate(${angle}deg) translateX(0px)`,
            }}
          />
        );
      })}
    </div>
  );
}
