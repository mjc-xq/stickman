"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStickmanBus, usePointer } from "@/app/hooks/stickman";
import { STORY_SLIDES } from "./slides";
import { StorySlide } from "./StorySlide";
import { HappyBirthdaySlide } from "./HappyBirthdaySlide";

const TOTAL_SLIDES = STORY_SLIDES.length + 1; // story slides + birthday particle slide
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
  const bus = useStickmanBus();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeSlideRef = useRef(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const lastTapRef = useRef(0);
  const starCanvasRef = useRef<HTMLCanvasElement>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);

  // Keep ref in sync with state
  useEffect(() => { activeSlideRef.current = activeSlide; }, [activeSlide]);

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

  // Navigate to a specific slide
  // iOS Safari: scroll-snap fights programmatic smooth scroll, so we
  // temporarily disable snap, scroll, then re-enable after it settles.
  const goToSlide = useCallback((index: number) => {
    const container = scrollRef.current;
    const el = slideRefs.current[index];
    if (!container || !el) return;

    container.style.scrollSnapType = "none";
    el.scrollIntoView({ behavior: "smooth", block: "start" });

    const restore = () => { container.style.scrollSnapType = "y mandatory"; };
    // scrollend is ideal but not universally supported; timeout as fallback
    const onEnd = () => { restore(); container.removeEventListener("scrollend", onEnd); };
    container.addEventListener("scrollend", onEnd, { once: true });
    setTimeout(restore, 1000);
  }, []);

  // Wand tap → advance to next slide (subscribe directly to bus for reliability)
  useEffect(() => {
    const unsub = bus.subscribeType("gesture", (event) => {
      if (event.gesture !== "Tap") return;
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

  // Don't show wand pointer on the finale slide (it has its own particle pointer)
  const showWandPointer = activeSlide < STORY_SLIDES.length;

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

      {/* Wand pointer overlay (visible on all slides except particle finale) */}
      {showWandPointer && <WandPointer />}

      {/* Scroll snap container */}
      <div
        ref={scrollRef}
        className="relative z-10 w-full h-full overflow-y-auto"
        style={{
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
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

        <div ref={setSlideRef(STORY_SLIDES.length)}>
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
      `}</style>
    </div>
  );
}

/** Wand sparkle pointer — follows the device pointer on all story slides */
function WandPointer() {
  const pointer = usePointer();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId = 0;
    let w = 0, h = 0;

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    };

    const animate = () => {
      if (w === 0 || h === 0) { animId = requestAnimationFrame(animate); return; }
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, w, h);

      const norm = pointer.current;
      // Map normalized pointer (-2..2) to screen coords
      const mx = w / 2 + norm.x * (w / 4);
      const my = h / 2 + norm.y * (h / 4);

      const t = performance.now() * 0.001;

      // Orbiting sparkles
      for (let i = 0; i < 6; i++) {
        const angle = t * (1.5 + i * 0.4) + (i * Math.PI * 2) / 6;
        const orbit = 10 + Math.sin(t * 2 + i) * 7;
        const sx = mx + Math.cos(angle) * orbit;
        const sy = my + Math.sin(angle) * orbit;
        const sparkleAlpha = 0.5 + Math.sin(t * 4 + i * 1.3) * 0.4;
        const sr = 1.5 + Math.sin(t * 3 + i * 0.7) * 0.8;

        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(220, 210, 255, ${sparkleAlpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Central glow
      const glowAlpha = 0.15 + Math.sin(t * 2.5) * 0.08;
      const grd = ctx.createRadialGradient(mx, my, 0, mx, my, 25);
      grd.addColorStop(0, `rgba(200, 180, 255, ${glowAlpha})`);
      grd.addColorStop(0.5, `rgba(168, 85, 247, ${glowAlpha * 0.4})`);
      grd.addColorStop(1, "rgba(200, 180, 255, 0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(mx, my, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      animId = requestAnimationFrame(animate);
    };

    resize();
    animId = requestAnimationFrame(animate);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[15] pointer-events-none"
    />
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
