"use client";

import { useEffect, useState } from "react";

// Pre-computed sparkle positions (stable across renders)
const SPARKLES = Array.from({ length: 20 }, (_, i) => ({
  size: 3 + ((i * 7 + 3) % 6),
  top: 15 + ((i * 31 + 17) % 70),
  left: 5 + ((i * 47 + 11) % 90),
  color: i % 4 === 0 ? "#ffd700" : i % 4 === 1 ? "#ff69b4" : i % 4 === 2 ? "#da70d6" : "#ffffff",
  animDuration: 1.2 + ((i * 13 + 5) % 20) * 0.15,
  animDelay: ((i * 19 + 7) % 20) * 0.15,
  shadow: 6 + ((i * 11 + 3) % 12),
}));

interface HappyBirthdaySlideProps {
  isActive: boolean;
}

export function HappyBirthdaySlide({ isActive }: HappyBirthdaySlideProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (isActive) {
      const t = setTimeout(() => setRevealed(true), 300);
      return () => clearTimeout(t);
    } else {
      setRevealed(false);
    }
  }, [isActive]);

  return (
    <section
      className="h-[100dvh] w-full flex flex-col items-center justify-center relative snap-start snap-always"
      style={{ scrollSnapAlign: "start" }}
    >
      {/* Main text */}
      <div
        className="text-center"
        style={{
          opacity: revealed ? 1 : 0,
          transform: revealed ? "scale(1)" : "scale(0.7)",
          transition: "opacity 1s ease-out, transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <h1
          className="text-5xl md:text-8xl font-bold tracking-wider leading-tight"
          style={{
            background: "linear-gradient(135deg, #ffd700, #ff69b4, #da70d6, #ffd700)",
            backgroundSize: "300% 300%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: revealed ? "shimmer 3s ease-in-out infinite" : "none",
            filter: "drop-shadow(0 0 30px rgba(255,215,0,0.5)) drop-shadow(0 0 60px rgba(218,112,214,0.4))",
          }}
        >
          Happy Birthday
        </h1>
        <h2
          className="text-4xl md:text-7xl font-bold tracking-widest mt-4"
          style={{
            opacity: revealed ? 1 : 0,
            transform: revealed ? "translateY(0)" : "translateY(30px)",
            transition: "opacity 1.2s ease-out 0.5s, transform 1.2s ease-out 0.5s",
            background: "linear-gradient(135deg, #da70d6, #ffd700, #ff69b4, #ffd700)",
            backgroundSize: "300% 300%",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: revealed ? "shimmer 3s ease-in-out infinite 0.5s" : "none",
            filter: "drop-shadow(0 0 25px rgba(255,215,0,0.5)) drop-shadow(0 0 50px rgba(218,112,214,0.4))",
          }}
        >
          You&apos;re a Star!
        </h2>
      </div>

      {/* Sparkles everywhere */}
      {revealed && (
        <div className="absolute inset-0 pointer-events-none">
          {SPARKLES.map((s, i) => (
            <div
              key={i}
              className="absolute rounded-full"
              style={{
                width: `${s.size}px`,
                height: `${s.size}px`,
                top: `${s.top}%`,
                left: `${s.left}%`,
                background: s.color,
                animation: `sparkle ${s.animDuration}s ease-in-out infinite alternate`,
                animationDelay: `${s.animDelay}s`,
                boxShadow: `0 0 ${s.shadow}px ${s.color}`,
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
