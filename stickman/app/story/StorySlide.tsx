"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import { STORY_SLIDES, type Slide, type SplitPiece } from "./slides";
import { FairyFlight } from "./FairyFlight";
import { FloatingBubbleCece } from "./FloatingBubbleCece";
import { MontageSlide, type MontageFrame } from "./MontageSlide";

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
  splitFg?: SplitPiece[];
  fairyTriggerWord?: string;
  isTitle?: boolean;
  floatingBubble?: boolean;
  montage?: MontageFrame[];
}

export function StorySlide({
  lines, bgSrc, fgSrc, index, isActive, effect, effectTriggerWord, splitFg, fairyTriggerWord, isTitle, floatingBubble, montage,
}: StorySlideProps) {
  const hasSplit = splitFg && splitFg.length > 0;
  const isFirstSlide = index === 0;

  // GSAP target refs
  const bgRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<HTMLDivElement>(null);
  const fgImgRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);

  // Animation refs
  const entranceTlRef = useRef<gsap.core.Timeline | null>(null);
  const kbRef = useRef<gsap.core.Tween | null>(null);
  const idleRef = useRef<gsap.core.Tween | null>(null);
  const idleGlowRef = useRef<gsap.core.Tween | null>(null);
  const wasActiveRef = useRef(false);
  const hasPlayedOnceRef = useRef(false);

  // Typewriter state
  const [line1Text, setLine1Text] = useState("");
  const [line2Text, setLine2Text] = useState("");
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showEffect, setShowEffect] = useState(false);
  const effectFiredRef = useRef(false);
  const [showFairy, setShowFairy] = useState(false);
  const fairyFiredRef = useRef(false);

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
        if (fairyTriggerWord && !fairyFiredRef.current && cur.toLowerCase().includes(fairyTriggerWord.toLowerCase())) {
          fairyFiredRef.current = true;
          setShowFairy(true);
        }
        i++;
        typeTimerRef.current = setTimeout(type, 35);
      } else {
        let j = 0;
        const typeLine2 = () => {
          if (cancelled) return;
          if (j <= fullLine2.length) {
            const cur2 = fullLine2.slice(0, j);
            setLine2Text(cur2);
            // Check for fairy trigger in line 2
            if (fairyTriggerWord && !fairyFiredRef.current && cur2.toLowerCase().includes(fairyTriggerWord.toLowerCase())) {
              fairyFiredRef.current = true;
              setShowFairy(true);
            }
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

  // Build GSAP entrance timeline ONCE on mount.
  // Elements start hidden via CSS inline styles (see JSX below), so no flash.
  // The timeline animates FROM those hidden positions TO their visible final state.
  useEffect(() => {
    const bg = bgRef.current;
    const fg = fgRef.current;
    const fgImg = fgImgRef.current;
    const glow = glowRef.current;
    const text = textRef.current;
    if (!bg || !fg || !glow || !text) return;

    // Build entrance timeline (paused — played when isActive becomes true)
    const tl = gsap.timeline({ paused: true });

    // t=0: Background fades in and slides up from below (slow, cinematic)
    tl.to(bg, {
      y: 0, scale: 1.06, opacity: 1,
      duration: 1.5, ease: "power2.out", force3D: true,
    }, 0);

    // t=0.4: Glow fades in
    tl.to(glow, {
      opacity: 1, scale: 1, duration: 1.2, ease: "power1.out",
    }, 0.4);

    if (hasSplit && splitContainerRef.current) {
      // SPLIT FOREGROUND: each piece animated to its own final position
      const pieces = splitContainerRef.current.querySelectorAll<HTMLElement>(".split-piece");
      pieces.forEach((el, i) => {
        const piece = splitFg![i];
        if (!piece) return;
        // Animate FROM inline-style start position TO final resting position
        tl.to(el, {
          xPercent: piece.toX, yPercent: piece.toY,
          scale: piece.toScale, rotation: 0, opacity: 1,
          duration: piece.duration, ease: piece.ease, force3D: true,
        }, 0.8 + piece.delay);
      });
    } else {
      // SINGLE FOREGROUND: spring up from below
      tl.to(fg, {
        y: 0, scale: 1, opacity: 1,
        duration: 1.4, ease: "back.out(1.4)", force3D: true,
      }, 0.8);

      if (fgImg) {
        tl.to(fgImg, {
          rotateX: 0, rotateY: 0,
          duration: 1.5, ease: "power2.out", force3D: true,
        }, 0.8);
      }
    }

    // Non-word-triggered effects
    if (effect && !effectTriggerWord) {
      tl.call(() => setShowEffect(true), [], 1.2);
    }

    // Text slides up (later for split slides since pieces take longer)
    tl.to(text, {
      y: 0, opacity: 1,
      duration: 0.7, ease: "expo.out", force3D: true,
    }, hasSplit ? 2.8 : 2.0);

    // Start typewriter
    let cancelType: (() => void) | null = null;
    tl.call(() => { cancelType = startTypewriter(); }, [], hasSplit ? 3.0 : 2.2);

    entranceTlRef.current = tl;

    return () => {
      tl.kill();
      if (cancelType) cancelType();
      stopTypewriter();
      if (kbRef.current) kbRef.current.kill();
      if (idleRef.current) idleRef.current.kill();
      if (idleGlowRef.current) idleGlowRef.current.kill();
    };
    // These deps are all stable (derived from props that don't change per-slide)
  }, [index, effect, effectTriggerWord, hasSplit, splitFg, startTypewriter, stopTypewriter]);

  // React to isActive changes: play entrance or exit
  useEffect(() => {
    const tl = entranceTlRef.current;
    const bg = bgRef.current;
    const fg = fgRef.current;
    const glow = glowRef.current;
    const text = textRef.current;
    if (!tl || !bg || !fg || !glow || !text) return;

    const kb = KB_DRIFT[index % KB_DRIFT.length];

    if (isActive && !wasActiveRef.current) {
      // --- ENTRANCE ---
      wasActiveRef.current = true;
      hasPlayedOnceRef.current = true;
      effectFiredRef.current = false;
      fairyFiredRef.current = false;
      setShowFairy(false);

      // Reset the timeline to beginning and play
      tl.restart();

      // Ken Burns: slow continuous drift on background
      if (kbRef.current) kbRef.current.kill();
      kbRef.current = gsap.to(bg, {
        xPercent: parseFloat(kb.x), yPercent: parseFloat(kb.y), scale: kb.scale,
        duration: 15, ease: "none", force3D: true, delay: 1.0,
      });

      // Idle float on foreground (starts after fg settles — later for split slides)
      const idleDelay = hasSplit ? 3.5 : 2.5;
      if (idleRef.current) idleRef.current.kill();
      idleRef.current = gsap.to(fg, {
        y: -8, rotation: 0.5,
        duration: 3, ease: "sine.inOut", yoyo: true, repeat: -1,
        delay: idleDelay, force3D: true,
      });
      if (idleGlowRef.current) idleGlowRef.current.kill();
      idleGlowRef.current = gsap.to(glow, {
        y: -6, scale: 1.03,
        duration: 3.4, ease: "sine.inOut", yoyo: true, repeat: -1,
        delay: idleDelay,
      });
    } else if (!isActive && wasActiveRef.current) {
      // --- EXIT ---
      wasActiveRef.current = false;

      // Stop running animations
      stopTypewriter();
      setLine1Text("");
      setLine2Text("");
      setShowEffect(false);
      setShowFairy(false);

      tl.pause();
      if (kbRef.current) { kbRef.current.kill(); kbRef.current = null; }
      if (idleRef.current) { idleRef.current.kill(); idleRef.current = null; }
      if (idleGlowRef.current) { idleGlowRef.current.kill(); idleGlowRef.current = null; }

      // Staggered exit: text -> fg -> bg, then reset to initial hidden state
      gsap.to(text, { y: 16, opacity: 0, duration: 0.25, ease: "power3.in", force3D: true });

      if (hasSplit && splitContainerRef.current) {
        const pieces = splitContainerRef.current.querySelectorAll(".split-piece");
        pieces.forEach((el, i) => {
          const piece = splitFg![i];
          gsap.to(el, {
            x: piece ? piece.fromX * 0.5 : 0, opacity: 0, scale: 0.9,
            duration: 0.3, ease: "power3.in", delay: 0.05 * i, force3D: true,
          });
        });
      }

      gsap.to(fg, { scale: 0.9, opacity: 0, duration: 0.35, ease: "power3.in", delay: 0.08, force3D: true });
      gsap.to(glow, { opacity: 0, duration: 0.3, delay: 0.08 });
      gsap.to(bg, {
        opacity: 0, duration: 0.4, ease: "power2.in", delay: 0.12, force3D: true,
        onComplete: () => {
          // Reset all elements back to their initial hidden positions so
          // the next entrance plays cleanly from the start.
          tl.progress(0).pause();
          // Reset split pieces to their CSS initial state
          if (hasSplit && splitContainerRef.current) {
            const pieces = splitContainerRef.current.querySelectorAll<HTMLElement>(".split-piece");
            pieces.forEach((el, i) => {
              const piece = splitFg![i];
              if (!piece) return;
              gsap.set(el, {
                x: piece.fromX, y: piece.fromY,
                xPercent: 0, yPercent: 0,
                scale: piece.fromScale, rotation: piece.fromRotate,
                opacity: 0, force3D: true,
              });
            });
          }
        },
      });
    }
  }, [isActive, index, hasSplit, splitFg, stopTypewriter]);

  return (
    <section className="h-[100dvh] w-full relative overflow-hidden">
      {/* Slide counter */}
      <div className="absolute top-4 left-4 text-[10px] tracking-[0.3em] uppercase text-purple-400/30 font-mono z-20">
        {index + 1} / {STORY_SLIDES.length}
      </div>

      {/* Background — starts hidden via inline styles, GSAP animates to visible.
          First slide starts visible so the user sees something immediately. */}
      <div
        ref={bgRef}
        className="absolute inset-0 z-0"
        style={{
          opacity: isFirstSlide ? 1 : 0,
          transform: isFirstSlide
            ? "translate3d(0, 0, 0) scale(1.06)"
            : "translate3d(0, 30%, 0) scale(1.08)",
          willChange: "transform, opacity",
        }}
      >
        <img
          src={bgSrc}
          alt=""
          className="w-full h-full object-cover"
          loading={index <= 1 ? "eager" : "lazy"}
          style={{ opacity: 0.8 }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/70" />
      </div>

      {/* Per-slide effects */}
      {showEffect && effect === "shooting-star" && <ShootingStarEffect />}
      {showEffect && effect === "flash" && <FlashEffect />}
      {showEffect && effect === "sparkle-burst" && <SparkleBurstEffect />}

      {/* Fairy flight animation */}
      {showFairy && <FairyFlight onComplete={() => setShowFairy(false)} />}

      {/* Floating bubble Cece — only when this slide is active */}
      {floatingBubble && isActive && <FloatingBubbleCece />}

      {/* Montage: cycling Cece+Alex image pairs */}
      {montage && montage.length > 0 && (
        <MontageSlide frames={montage} isActive={isActive} />
      )}

      {/* Foreground — starts hidden via inline styles */}
      <div
        className="absolute inset-0 flex items-center justify-center z-10"
        style={{ perspective: "1000px" }}
      >
        <div
          ref={fgRef}
          style={{
            width: "90vw",
            maxWidth: "600px",
            // Single fg starts hidden below; split fg container starts visible
            // (individual split pieces handle their own hidden state)
            opacity: hasSplit ? 1 : (isFirstSlide ? 1 : 0),
            transform: hasSplit
              ? "translate3d(0, 0, 0) scale(1)"
              : (isFirstSlide
                ? "translate3d(0, 0, 0) scale(1)"
                : "translate3d(0, 80px, 0) scale(0.92)"),
            willChange: "transform, opacity",
          }}
        >
          <div
            ref={glowRef}
            className="absolute -inset-8 rounded-full blur-3xl"
            style={{
              background: "radial-gradient(ellipse, rgba(168,85,247,0.3) 0%, rgba(59,130,246,0.15) 40%, transparent 70%)",
              opacity: isFirstSlide ? 1 : 0,
              transform: isFirstSlide ? "scale(1)" : "scale(0.8)",
              willChange: "transform, opacity",
            }}
          />

          {/* Single foreground (default) */}
          {!hasSplit && (
            <div
              ref={fgImgRef}
              style={{
                transform: isFirstSlide
                  ? "rotateX(0deg) rotateY(0deg)"
                  : "rotateX(6deg) rotateY(-2deg)",
                willChange: "transform",
              }}
            >
              <img
                src={fgSrc}
                alt={`Scene ${index + 1}`}
                loading={index <= 1 ? "eager" : "lazy"}
                className="relative w-full h-auto object-contain"
                style={{
                  maxHeight: "55dvh",
                  filter: "drop-shadow(0 8px 30px rgba(0,0,0,0.6)) drop-shadow(0 0 60px rgba(168,85,247,0.15))",
                }}
              />
            </div>
          )}

          {/* Split foreground pieces — positioned absolutely, each starts offset from its final spot */}
          {hasSplit && (
            <div
              ref={splitContainerRef}
              className="relative w-full"
              style={{ height: "55dvh" }}
            >
              {splitFg!.map((piece, i) => (
                <img
                  key={i}
                  src={piece.src}
                  alt=""
                  className="split-piece absolute h-auto object-contain"
                  loading="eager"
                  style={{
                    maxHeight: piece.maxH,
                    maxWidth: "48vw",
                    // Position at center of container, GSAP will move to toX/toY
                    left: "50%",
                    top: "50%",
                    marginLeft: "-24vw", // offset half of maxWidth to center
                    marginTop: `-${parseInt(piece.maxH) / 2}dvh`,
                    filter: "drop-shadow(0 8px 30px rgba(0,0,0,0.6)) drop-shadow(0 0 40px rgba(168,85,247,0.15))",
                    // Start hidden at offset position — GSAP animates to toX/toY
                    opacity: 0,
                    transform: `translate3d(${piece.fromX}px, ${piece.fromY}px, 0) scale(${piece.fromScale}) rotate(${piece.fromRotate}deg)`,
                    willChange: "transform, opacity",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Text */}
      <div
        ref={textRef}
        className={isTitle ? "absolute top-8 inset-x-0 z-20 px-6" : "absolute bottom-8 inset-x-0 z-20 px-6"}
        style={{
          opacity: isFirstSlide ? 1 : 0,
          transform: isFirstSlide
            ? "translate3d(0, 0, 0)"
            : "translate3d(0, 30px, 0)",
          willChange: "transform, opacity",
        }}
      >
        <div className="max-w-[700px] mx-auto text-center">
          {isTitle ? (
            <div className="py-4">
              <h1
                className="text-6xl md:text-8xl font-bold leading-none"
                style={{
                  fontFamily: "var(--font-fredoka), var(--font-geist-sans), sans-serif",
                  background: "linear-gradient(135deg, #ffd700 0%, #ff69b4 35%, #da70d6 65%, #ffd700 100%)",
                  backgroundSize: "300% 300%",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  animation: "shimmer 3s ease-in-out infinite",
                  filter: "drop-shadow(0 0 25px rgba(255,215,0,0.5)) drop-shadow(0 0 50px rgba(218,112,214,0.3))",
                  letterSpacing: "-0.02em",
                }}
              >
                {lines[0]}
              </h1>
              <div
                className="mt-4 mx-auto"
                style={{
                  width: "60%",
                  height: "2px",
                  background: "linear-gradient(to right, transparent, rgba(255,215,0,0.6), rgba(218,112,214,0.6), transparent)",
                }}
              />
              <p
                className="text-2xl md:text-4xl font-semibold tracking-[0.2em] uppercase mt-4"
                style={{
                  fontFamily: "var(--font-fredoka), var(--font-geist-sans), sans-serif",
                  color: "#e8dff5",
                  textShadow: "0 2px 8px rgba(0,0,0,1), 0 0 30px rgba(0,0,0,0.6)",
                }}
              >
                {lines[1]}
              </p>
            </div>
          ) : (
            <>
          <p
            className="text-3xl md:text-4xl leading-snug tracking-wide font-bold"
            style={{
              color: "#fff",
              textShadow: "0 2px 4px rgba(0,0,0,1), 0 0 20px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.6)",
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
              color: "#fff",
              textShadow: "0 2px 4px rgba(0,0,0,1), 0 0 20px rgba(0,0,0,0.8), 0 0 60px rgba(0,0,0,0.6)",
              minHeight: "1.5em",
            }}
          >
            {line2Text}
            {line2Text.length > 0 && line2Text.length < lines[1].length && (
              <span className="inline-block w-[2px] h-[1.1em] bg-purple-300 align-middle ml-0.5 animate-pulse" />
            )}
          </p>
            </>
          )}
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
