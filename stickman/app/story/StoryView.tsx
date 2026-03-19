"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useGestures } from "@/app/hooks/stickman";
import { STORY_SLIDES } from "./slides";
import { StorySlide } from "./StorySlide";
import { HappyBirthdaySlide } from "./HappyBirthdaySlide";
import { BirthdayFinale } from "./BirthdayFinale";

const TOTAL_SLIDES = STORY_SLIDES.length + 2; // story slides + birthday text + particle finale
const TAP_DEBOUNCE_MS = 600;

// Pre-compute stable random values for twinkling stars (avoids hydration mismatch)
const TWINKLE_STARS = Array.from({ length: 30 }, (_, i) => ({
  w: 1 + ((i * 7 + 3) % 5) * 0.4,
  top: ((i * 31 + 17) % 100),
  left: ((i * 47 + 11) % 100),
  dur: 2 + ((i * 13 + 5) % 8) * 0.5,
  delay: ((i * 19 + 7) % 10) * 0.5,
}));

export function StoryView() {
  const gestures = useGestures();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const lastTapRef = useRef(0);
  const starCanvasRef = useRef<HTMLCanvasElement>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);

  // Draw starfield background (fixed, behind everything)
  useEffect(() => {
    const canvas = starCanvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;

      // Gradient matching ParticleImageViz
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0a0618");
      grad.addColorStop(0.25, "#1a0a3a");
      grad.addColorStop(0.5, "#2a1050");
      grad.addColorStop(0.75, "#1e0d40");
      grad.addColorStop(1, "#0c0820");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Stars
      const starCount = Math.round((w * h) / 800);
      for (let i = 0; i < starCount; i++) {
        const sx = Math.random() * w;
        const sy = Math.random() * h;
        const sr = Math.random() * 1.5;
        const alpha = 0.15 + Math.random() * 0.65;
        const temp = Math.random();
        ctx.fillStyle = temp < 0.6 ? `rgba(255,255,255,${alpha})`
          : temp < 0.8 ? `rgba(200,210,255,${alpha})` : `rgba(255,220,200,${alpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, []);

  // Track active slide via scroll position (more reliable than IntersectionObserver)
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const slideHeight = container.clientHeight;
      if (slideHeight === 0) return;
      const scrollTop = container.scrollTop;
      const active = Math.round(scrollTop / slideHeight);
      setActiveSlide(Math.min(active, TOTAL_SLIDES - 1));
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Ref callback for slide elements
  const setSlideRef = useCallback((index: number) => (el: HTMLElement | null) => {
    slideRefs.current[index] = el;
  }, []);

  // Advance to next slide
  const goToNextSlide = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < TAP_DEBOUNCE_MS) return;
    lastTapRef.current = now;

    const nextSlide = Math.min(activeSlide + 1, TOTAL_SLIDES - 1);
    const target = slideRefs.current[nextSlide];
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeSlide]);

  // Wand tap → advance to next slide
  useEffect(() => {
    if (!gestures.lastGesture || gestures.lastGesture !== "Tap") return;
    goToNextSlide();
  }, [gestures.lastGesture, gestures.timestamp, goToNextSlide]);

  // Keyboard: arrow down, space, right arrow → next slide
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goToNextSlide();
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const now = Date.now();
        if (now - lastTapRef.current < TAP_DEBOUNCE_MS) return;
        lastTapRef.current = now;
        const prevSlide = Math.max(activeSlide - 1, 0);
        const target = slideRefs.current[prevSlide];
        if (target) target.scrollIntoView({ behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeSlide, goToNextSlide]);

  return (
    <div className="relative w-full h-[100dvh] overflow-hidden bg-[#0a0618]">
      {/* Fixed starfield background */}
      <canvas
        ref={starCanvasRef}
        className="fixed inset-0 w-full h-full z-0"
        style={{ pointerEvents: "none" }}
      />

      {/* Twinkling star overlay (CSS animated) */}
      <div className="fixed inset-0 z-[1] pointer-events-none">
        {TWINKLE_STARS.map((s, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              width: `${s.w}px`,
              height: `${s.w}px`,
              top: `${s.top}%`,
              left: `${s.left}%`,
              animation: `twinkle ${s.dur}s ease-in-out infinite`,
              animationDelay: `${s.delay}s`,
              opacity: 0.3,
            }}
          />
        ))}
      </div>

      {/* Shooting stars (periodic) */}
      <ShootingStars />

      {/* Scroll snap container */}
      <div
        ref={scrollRef}
        className="relative z-10 w-full h-full overflow-y-auto"
        style={{
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Story slides */}
        {STORY_SLIDES.map((slide, index) => (
          <div key={index} ref={setSlideRef(index)}>
            <StorySlide
              lines={slide.lines}
              imageSrc={slide.image}
              index={index}
              isActive={activeSlide === index}
            />
          </div>
        ))}

        {/* Happy Birthday text slide */}
        <div ref={setSlideRef(STORY_SLIDES.length)}>
          <HappyBirthdaySlide isActive={activeSlide === STORY_SLIDES.length} />
        </div>

        {/* Particle stars finale */}
        <div ref={setSlideRef(STORY_SLIDES.length + 1)}>
          <BirthdayFinale isActive={activeSlide === STORY_SLIDES.length + 1} />
        </div>
      </div>

      {/* Tap hint (shows briefly at start) */}
      <TapHint />

      {/* Global CSS animations */}
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.1; transform: scale(0.8); }
          50% { opacity: 0.9; transform: scale(1.2); }
        }

        @keyframes sparkle {
          0% { opacity: 0.2; transform: scale(0.5); }
          100% { opacity: 1; transform: scale(1.5); }
        }

        @keyframes shimmer {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes shootingStar {
          0% {
            transform: translateX(0) translateY(0) rotate(-45deg);
            opacity: 1;
          }
          70% { opacity: 1; }
          100% {
            transform: translateX(400px) translateY(400px) rotate(-45deg);
            opacity: 0;
          }
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/** Periodic shooting stars across the screen */
function ShootingStars() {
  const [stars, setStars] = useState<{ id: number; x: number; y: number; duration: number }[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const spawn = () => {
      const id = nextId.current++;
      setStars((prev) => [
        ...prev.slice(-3),
        {
          id,
          x: Math.random() * 60 + 10,
          y: Math.random() * 30,
          duration: 0.8 + Math.random() * 0.6,
        },
      ]);
    };

    let timerId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timerId = setTimeout(() => {
        spawn();
        scheduleNext();
      }, 4000 + Math.random() * 4000);
    };

    const first = setTimeout(() => {
      spawn();
      scheduleNext();
    }, 2000);

    return () => {
      clearTimeout(first);
      clearTimeout(timerId);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[2] pointer-events-none overflow-hidden">
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: "80px",
            height: "1px",
            background: "linear-gradient(to right, transparent, rgba(255,255,255,0.8), white)",
            borderRadius: "1px",
            boxShadow: "0 0 4px rgba(255,255,255,0.6), 0 0 12px rgba(168,85,247,0.3)",
            animation: `shootingStar ${s.duration}s ease-out forwards`,
          }}
        />
      ))}
    </div>
  );
}

/** Brief tap hint that fades out */
function TapHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="fixed bottom-8 inset-x-0 flex justify-center z-20 pointer-events-none"
      style={{
        opacity: visible ? 0.6 : 0,
        transition: "opacity 1s ease-out",
      }}
    >
      <div
        className="px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm text-white/70 text-xs tracking-widest uppercase"
        style={{ animation: "fadeInUp 1s ease-out" }}
      >
        tap wand to continue
      </div>
    </div>
  );
}
