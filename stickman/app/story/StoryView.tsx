"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStickmanBus } from "@/app/hooks/stickman";
import { STORY_SLIDES } from "./slides";
import { StorySlide } from "./StorySlide";
import { HappyBirthdaySlide } from "./HappyBirthdaySlide";

const TOTAL_SLIDES = STORY_SLIDES.length + 1; // story slides + birthday particle slide
const TAP_DEBOUNCE_MS = 600;

// Pre-compute stable random values for twinkling stars (avoids hydration mismatch)
const TWINKLE_STARS = Array.from({ length: 15 }, (_, i) => ({
  w: 1 + ((i * 7 + 3) % 5) * 0.4,
  top: ((i * 31 + 17) % 100),
  left: ((i * 47 + 11) % 100),
  dur: 2 + ((i * 13 + 5) % 8) * 0.5,
  delay: ((i * 19 + 7) % 10) * 0.5,
}));

export function StoryView() {
  const bus = useStickmanBus();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeSlideRef = useRef(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const lastTapRef = useRef(0);
  const animatingRef = useRef(false); // true while slide entrance is playing — ignore taps
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const starCanvasRef = useRef<HTMLCanvasElement>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);

  // Keep ref in sync with state + lock out taps during animation
  useEffect(() => {
    activeSlideRef.current = activeSlide;
    // Lock taps for 2.5s while entrance animation plays
    animatingRef.current = true;
    if (animTimerRef.current) clearTimeout(animTimerRef.current);
    // Longer lockout for finale slide (has 3 characters entering)
    const lockoutMs = activeSlide === STORY_SLIDES.length - 1 ? 7000 : 4000;
    animTimerRef.current = setTimeout(() => { animatingRef.current = false; }, lockoutMs);
  }, [activeSlide]);

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

      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0a0618");
      grad.addColorStop(0.25, "#1a0a3a");
      grad.addColorStop(0.5, "#2a1050");
      grad.addColorStop(0.75, "#1e0d40");
      grad.addColorStop(1, "#0c0820");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const starCount = Math.round((w * h) / 400); // dense starfield
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

  // Track active slide via scroll position
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      const slideHeight = container.clientHeight;
      if (slideHeight === 0) return;
      const active = Math.round(container.scrollTop / slideHeight);
      setActiveSlide(Math.min(active, TOTAL_SLIDES - 1));
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Ref callback for slide elements
  const setSlideRef = useCallback((index: number) => (el: HTMLElement | null) => {
    slideRefs.current[index] = el;
  }, []);

  // Navigate to a specific slide — instant jump (no scroll animation needed
  // since GSAP handles all visual transitions via entrance/exit timelines)
  const goToSlide = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const slideHeight = container.clientHeight;
    container.scrollTop = index * slideHeight;
  }, []);

  // Wand tap -> advance to next slide (ignored during animations — no queuing)
  useEffect(() => {
    const unsub = bus.subscribeType("gesture", (event) => {
      if (event.gesture !== "Tap") return;
      if (animatingRef.current) return; // ignore taps during entrance animation
      const now = Date.now();
      if (now - lastTapRef.current < TAP_DEBOUNCE_MS) return;
      lastTapRef.current = now;
      const next = Math.min(activeSlideRef.current + 1, TOTAL_SLIDES - 1);
      goToSlide(next);
    });
    return unsub;
  }, [bus, goToSlide]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (animatingRef.current) return; // ignore during animation
      const now = Date.now();
      if (now - lastTapRef.current < TAP_DEBOUNCE_MS) return;

      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        lastTapRef.current = now;
        goToSlide(Math.min(activeSlideRef.current + 1, TOTAL_SLIDES - 1));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        lastTapRef.current = now;
        goToSlide(Math.max(activeSlideRef.current - 1, 0));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goToSlide]);

  // Preload adjacent slide images
  useEffect(() => {
    const preload = (src: string) => { const img = new Image(); img.src = src; };
    [activeSlide, activeSlide + 1].forEach((i) => {
      if (i >= 0 && i < STORY_SLIDES.length) {
        preload(STORY_SLIDES[i].bg);
        preload(STORY_SLIDES[i].fg);
      }
    });
  }, [activeSlide]);

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

      {/* Shooting stars */}
      <ShootingStars />

      {/* Scroll container — overflow hidden, navigation only via tap/keyboard */}
      <div
        ref={scrollRef}
        className="relative z-10 w-full h-full overflow-hidden"
        style={{}}
      >
        {STORY_SLIDES.map((slide, index) => (
          <div
            key={index}
            ref={setSlideRef(index)}
            className="h-[100dvh] w-full"
          >
            <StorySlide
              lines={slide.lines}
              bgSrc={slide.bg}
              fgSrc={slide.fg}
              index={index}
              isActive={activeSlide === index}
              effect={slide.effect}
              effectTriggerWord={slide.effectTriggerWord}
              splitFg={slide.splitFg}
              fairyTriggerWord={slide.fairyTriggerWord}
              isTitle={slide.isTitle}
              floatingBubble={slide.floatingBubble}
              montage={slide.montage}
            />
          </div>
        ))}

        <div
          ref={setSlideRef(STORY_SLIDES.length)}
          className="h-[100dvh] w-full snap-start"
          style={{ scrollSnapAlign: "start" }}
        >
          <HappyBirthdaySlide isActive={activeSlide === STORY_SLIDES.length} />
        </div>
      </div>

      <TapHint />

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
          0% { transform: translateX(0) translateY(0) rotate(-45deg); opacity: 1; }
          70% { opacity: 1; }
          100% { transform: translateX(400px) translateY(400px) rotate(-45deg); opacity: 0; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fairyTrailFade {
          0% { opacity: 0.9; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.2); }
        }
        @keyframes fairyGlow {
          0% { opacity: 0.4; transform: scale(0.9); }
          100% { opacity: 0.7; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}


function ShootingStars() {
  const [stars, setStars] = useState<{ id: number; x: number; y: number; duration: number }[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const spawn = () => {
      const id = nextId.current++;
      setStars((prev) => [
        ...prev.slice(-3),
        { id, x: Math.random() * 60 + 10, y: Math.random() * 30, duration: 0.8 + Math.random() * 0.6 },
      ]);
    };

    let timerId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timerId = setTimeout(() => { spawn(); scheduleNext(); }, 4000 + Math.random() * 4000);
    };
    const first = setTimeout(() => { spawn(); scheduleNext(); }, 2000);

    return () => { clearTimeout(first); clearTimeout(timerId); };
  }, []);

  return (
    <div className="fixed inset-0 z-[2] pointer-events-none overflow-hidden">
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute"
          style={{
            left: `${s.x}%`, top: `${s.y}%`,
            width: "80px", height: "1px",
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

function TapHint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="fixed bottom-8 inset-x-0 flex justify-center z-20 pointer-events-none"
      style={{ opacity: visible ? 0.6 : 0, transition: "opacity 1s ease-out" }}
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
