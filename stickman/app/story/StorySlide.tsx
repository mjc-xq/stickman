"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import { STORY_SLIDES, type Slide } from "./slides";

// Each slide's background enters from a different direction for variety
const BG_ENTER: Array<{ x: number; y: number }> = [
  { x: 0, y: -30 },   // from above
  { x: 30, y: 0 },    // from right
  { x: -30, y: 0 },   // from left
  { x: 0, y: 30 },    // from below
  { x: -20, y: -20 }, // top-left
  { x: 20, y: -20 },  // top-right
  { x: -20, y: 20 },  // bottom-left
  { x: 20, y: 20 },   // bottom-right
];

// Ken Burns drift — each slide zooms/pans to a different spot
const KB_DRIFT: Array<{ x: string; y: string; scale: number }> = [
  { x: "-1.5%", y: "-1%", scale: 1.02 },
  { x: "1%",   y: "-1.5%", scale: 1.03 },
  { x: "-1%",  y: "1%", scale: 1.02 },
  { x: "1.5%", y: "0.5%", scale: 1.03 },
  { x: "0%",   y: "-1.5%", scale: 1.02 },
  { x: "-1.5%", y: "0.5%", scale: 1.03 },
  { x: "1%",   y: "1%", scale: 1.02 },
  { x: "-1%",  y: "-0.5%", scale: 1.03 },
];

interface StorySlideProps {
  lines: [string, string];
  bgSrc: string;
  fgSrc: string;
  index: number;
  isActive: boolean;
  effect?: Slide["effect"];
  effectTriggerWord?: string;
}

export function StorySlide({
  lines, bgSrc, fgSrc, index, isActive, effect, effectTriggerWord,
}: StorySlideProps) {
  // GSAP target refs
  const bgRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<HTMLDivElement>(null);
  const fgImgRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const kbRef = useRef<gsap.core.Tween | null>(null);
  const idleRef = useRef<gsap.core.Tween | null>(null);
  const idleGlowRef = useRef<gsap.core.Tween | null>(null);

  // Typewriter state
  const [line1Text, setLine1Text] = useState("");
  const [line2Text, setLine2Text] = useState("");
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showEffect, setShowEffect] = useState(false);
  const effectFiredRef = useRef(false);

  const stopTypewriter = useCallback(() => {
    if (typeTimerRef.current) { clearTimeout(typeTimerRef.current); typeTimerRef.current = null; }
  }, []);

  const startTypewriter = useCallback(() => {
    let cancelled = false;
    let i = 0;
    const fullLine1 = lines[0];
    const fullLine2 = lines[1];

    const type = () => {
      if (cancelled) return;
      if (i <= fullLine1.length) {
        const cur = fullLine1.slice(0, i);
        setLine1Text(cur);
        if (effectTriggerWord && !effectFiredRef.current && cur.includes(effectTriggerWord)) {
          effectFiredRef.current = true;
          setShowEffect(true);
        }
        i++;
        typeTimerRef.current = setTimeout(type, 35);
      } else {
        let j = 0;
        const typeLine2 = () => {
          if (cancelled) return;
          if (j <= fullLine2.length) {
            setLine2Text(fullLine2.slice(0, j));
            j++;
            typeTimerRef.current = setTimeout(typeLine2, 35);
          }
        };
        typeTimerRef.current = setTimeout(typeLine2, 250);
      }
    };
    type();
    return () => { cancelled = true; };
  }, [lines, effectTriggerWord]);

  // Build GSAP timeline on mount
  useEffect(() => {
    const bg = bgRef.current;
    const fg = fgRef.current;
    const fgImg = fgImgRef.current;
    const glow = glowRef.current;
    const text = textRef.current;
    if (!bg || !fg || !fgImg || !glow || !text) return;

    const dir = BG_ENTER[index % BG_ENTER.length];

    // Initial hidden state — all GPU-composited
    gsap.set(bg, { x: dir.x, y: dir.y, scale: 1.08, opacity: 0, force3D: true });
    gsap.set(fg, { y: 80, scale: 0.92, opacity: 0, force3D: true });
    gsap.set(fgImg, { rotateX: 6, rotateY: -2, force3D: true });
    gsap.set(glow, { opacity: 0, scale: 0.8 });
    gsap.set(text, { y: 30, opacity: 0, force3D: true });

    // Entrance timeline (paused — played when isActive)
    const tl = gsap.timeline({ paused: true });

    // t=0: Background fades/slides in
    tl.to(bg, {
      x: 0, y: 0, scale: 1.06, opacity: 1,
      duration: 1.0, ease: "power2.out", force3D: true,
    }, 0);

    // t=0.2: Glow fades in (overlaps bg)
    tl.to(glow, {
      opacity: 1, scale: 1, duration: 0.8, ease: "power1.out",
    }, 0.2);

    // t=0.4: Foreground springs up with overshoot (overlaps bg)
    tl.to(fg, {
      y: 0, scale: 1, opacity: 1,
      duration: 1.0, ease: "back.out(1.4)", force3D: true,
    }, 0.4);

    // t=0.4: 3D tilt correction on fg image
    tl.to(fgImg, {
      rotateX: 0, rotateY: 0,
      duration: 1.2, ease: "power2.out", force3D: true,
    }, 0.4);

    // t=0.8: Non-word-triggered effects
    if (effect && !effectTriggerWord) {
      tl.call(() => setShowEffect(true), [], 0.8);
    }

    // t=1.1: Text slides up (overlaps fg settle)
    tl.to(text, {
      y: 0, opacity: 1,
      duration: 0.5, ease: "expo.out", force3D: true,
    }, 1.1);

    // t=1.3: Start typewriter
    let cancelType: (() => void) | null = null;
    tl.call(() => { cancelType = startTypewriter(); }, [], 1.3);

    tlRef.current = tl;

    return () => {
      tl.kill();
      if (cancelType) cancelType();
      stopTypewriter();
      if (kbRef.current) kbRef.current.kill();
      if (idleRef.current) idleRef.current.kill();
      if (idleGlowRef.current) idleGlowRef.current.kill();
    };
  }, [index, effect, effectTriggerWord, startTypewriter, stopTypewriter]);

  // Play / exit based on isActive
  useEffect(() => {
    const tl = tlRef.current;
    const bg = bgRef.current;
    const fg = fgRef.current;
    const glow = glowRef.current;
    const text = textRef.current;
    if (!tl || !bg || !fg || !glow || !text) return;

    const kb = KB_DRIFT[index % KB_DRIFT.length];

    if (isActive) {
      effectFiredRef.current = false;
      tl.restart();

      // Ken Burns: slow continuous drift (starts after bg entrance)
      if (kbRef.current) kbRef.current.kill();
      kbRef.current = gsap.to(bg, {
        xPercent: parseFloat(kb.x), yPercent: parseFloat(kb.y), scale: kb.scale,
        duration: 15, ease: "none", force3D: true, delay: 1.0,
      });

      // Idle float on foreground (starts after fg settles)
      if (idleRef.current) idleRef.current.kill();
      idleRef.current = gsap.to(fg, {
        y: -8, rotation: 0.5,
        duration: 3, ease: "sine.inOut", yoyo: true, repeat: -1,
        delay: 1.8, force3D: true,
      });
      if (idleGlowRef.current) idleGlowRef.current.kill();
      idleGlowRef.current = gsap.to(glow, {
        y: -6, scale: 1.03,
        duration: 3.4, ease: "sine.inOut", yoyo: true, repeat: -1,
        delay: 1.8,
      });
    } else {
      // Fast staggered exit: text → fg → bg (reverse of entrance)
      stopTypewriter();
      setLine1Text("");
      setLine2Text("");
      setShowEffect(false);

      tl.pause();
      if (kbRef.current) { kbRef.current.kill(); kbRef.current = null; }
      if (idleRef.current) { idleRef.current.kill(); idleRef.current = null; }
      if (idleGlowRef.current) { idleGlowRef.current.kill(); idleGlowRef.current = null; }

      // Staggered exit
      gsap.to(text, { y: 16, opacity: 0, duration: 0.25, ease: "power3.in", force3D: true });
      gsap.to(fg, { scale: 0.9, opacity: 0, duration: 0.35, ease: "power3.in", delay: 0.08, force3D: true });
      gsap.to(glow, { opacity: 0, duration: 0.3, delay: 0.08 });
      gsap.to(bg, {
        opacity: 0, duration: 0.4, ease: "power2.in", delay: 0.12, force3D: true,
        onComplete: () => { tl.progress(0).pause(); },
      });
    }
  }, [isActive, index, stopTypewriter]);

  return (
    <section className="h-[100dvh] w-full relative snap-start snap-always overflow-hidden" style={{ scrollSnapAlign: "start" }}>
      {/* Slide counter */}
      <div className="absolute top-4 left-4 text-[10px] tracking-[0.3em] uppercase text-purple-400/30 font-mono z-20">
        {index + 1} / {STORY_SLIDES.length}
      </div>

      {/* Background — GSAP entrance + Ken Burns */}
      <div ref={bgRef} className="absolute inset-0 z-0" style={{ willChange: "transform, opacity" }}>
        <img src={bgSrc} alt="" className="w-full h-full object-cover" loading={index <= 1 ? "eager" : "lazy"} style={{ opacity: 0.8 }} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/70" />
      </div>

      {/* Per-slide effects */}
      {showEffect && effect === "shooting-star" && <ShootingStarEffect />}
      {showEffect && effect === "flash" && <FlashEffect />}
      {showEffect && effect === "sparkle-burst" && <SparkleBurstEffect />}

      {/* Foreground — GSAP spring entrance + idle bob */}
      <div className="absolute inset-0 flex items-center justify-center z-10" style={{ perspective: "1000px" }}>
        <div ref={fgRef} style={{ width: "90vw", maxWidth: "600px", willChange: "transform, opacity" }}>
          <div ref={glowRef} className="absolute -inset-8 rounded-full blur-3xl" style={{
            background: "radial-gradient(ellipse, rgba(168,85,247,0.3) 0%, rgba(59,130,246,0.15) 40%, transparent 70%)",
          }} />
          <div ref={fgImgRef} style={{ willChange: "transform" }}>
            <img src={fgSrc} alt={`Scene ${index + 1}`} loading={index <= 1 ? "eager" : "lazy"}
              className="relative w-full h-auto object-contain" style={{
                maxHeight: "55dvh",
                filter: "drop-shadow(0 8px 30px rgba(0,0,0,0.6)) drop-shadow(0 0 60px rgba(168,85,247,0.15))",
              }} />
          </div>
        </div>
      </div>

      {/* Text — GSAP entrance + typewriter */}
      <div ref={textRef} className="absolute bottom-8 inset-x-0 z-20 px-6" style={{ willChange: "transform, opacity" }}>
        <div className="max-w-[700px] mx-auto text-center">
          <p className="text-3xl md:text-4xl leading-snug tracking-wide font-bold" style={{
            color: "#fff", textShadow: "0 2px 4px rgba(0,0,0,1), 0 0 20px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.6)", minHeight: "1.5em",
          }}>
            {line1Text}
            {line1Text.length > 0 && line1Text.length < lines[0].length && (
              <span className="inline-block w-[2px] h-[1.1em] bg-purple-300 align-middle ml-0.5 animate-pulse" />
            )}
          </p>
          <p className="text-3xl md:text-4xl leading-snug tracking-wide font-bold mt-2" style={{
            color: "#fff", textShadow: "0 2px 4px rgba(0,0,0,1), 0 0 20px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.6)", minHeight: "1.5em",
          }}>
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

function ShootingStarEffect() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const star = el.querySelector(".star-head");
    const trails = el.querySelectorAll(".star-trail");
    if (star) gsap.fromTo(star, { x: 0, y: 0, opacity: 1 }, { x: "75vw", y: "30vh", opacity: 0, duration: 2, ease: "power1.out", force3D: true });
    trails.forEach((t, i) => gsap.fromTo(t, { x: 0, y: 0, opacity: 1 - i * 0.15 }, { x: "75vw", y: "30vh", opacity: 0, duration: 2, delay: 0.1 + i * 0.08, ease: "power1.out", force3D: true }));
  }, []);
  return (
    <div ref={ref} className="absolute inset-0 z-[5] pointer-events-none overflow-hidden">
      <div className="absolute star-head" style={{ top: "15%", left: "10%", width: "200px", height: "2px", background: "linear-gradient(to right, transparent, rgba(255,215,0,0.9), #ffd700, white)", borderRadius: "2px", boxShadow: "0 0 12px rgba(255,215,0,0.8), 0 0 30px rgba(255,215,0,0.4)" }} />
      {[0,1,2,3,4].map(i => <div key={i} className="absolute rounded-full star-trail" style={{ top: `${14+Math.sin(i*1.2)*3}%`, left: "10%", width: "4px", height: "4px", background: "#ffd700", boxShadow: "0 0 8px #ffd700" }} />)}
    </div>
  );
}

function FlashEffect() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) gsap.fromTo(ref.current, { opacity: 0.9 }, { opacity: 0, duration: 0.6, ease: "power2.out" }); }, []);
  return <div ref={ref} className="absolute inset-0 z-[5] pointer-events-none" style={{ background: "white" }} />;
}

function SparkleBurstEffect() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const sparkles = ref.current.querySelectorAll(".sp");
    sparkles.forEach((s, i) => {
      const angle = (i / 12) * Math.PI * 2;
      const dist = Math.min(window.innerWidth, window.innerHeight) * 0.35;
      gsap.fromTo(s, { x: 0, y: 0, opacity: 1, scale: 1 }, {
        x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, opacity: 0, scale: 0.3,
        duration: 1.2, delay: i * 0.04, ease: "power2.out", force3D: true,
      });
    });
  }, []);
  return (
    <div ref={ref} className="absolute inset-0 z-[5] pointer-events-none flex items-center justify-center">
      {Array.from({ length: 12 }).map((_, i) => <div key={i} className="absolute rounded-full sp" style={{
        width: "4px", height: "4px",
        background: i%3===0 ? "#ffd700" : i%3===1 ? "#da70d6" : "#fff",
        boxShadow: `0 0 8px ${i%3===0 ? "#ffd700" : i%3===1 ? "#da70d6" : "#fff"}`,
      }} />)}
    </div>
  );
}
