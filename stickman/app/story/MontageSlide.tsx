"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export interface MontageFrame {
  ceceSrc: string;
  alexSrc: string;
  // If set, shows a single full-width animated WebP instead of the Cece/Alex pair
  videoSrc?: string;
}

interface MontageSlideProps {
  frames: MontageFrame[];
  isActive: boolean;
  cycleDuration?: number; // seconds per frame (default 3.5)
}

/**
 * Cycles through paired Cece+Alex image frames with crossfade transitions.
 * Cece on the right doing magic, Alex on the left reacting.
 * Each swap has a smooth GSAP crossfade.
 */
export function MontageSlide({ frames, isActive, cycleDuration = 3.5 }: MontageSlideProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeFrame, setActiveFrame] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cycle frames when active — videos get 9s, images get 3.5s
  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) clearTimeout(intervalRef.current);
      setActiveFrame(0);
      return;
    }

    const scheduleNext = (currentIdx: number) => {
      const isVideo = !!frames[currentIdx]?.videoSrc;
      const delay = isVideo ? 9000 : cycleDuration * 1000; // videos need 9s to play fully
      intervalRef.current = setTimeout(() => {
        const next = (currentIdx + 1) % frames.length;
        setActiveFrame(next);
        scheduleNext(next);
      }, delay);
    };
    scheduleNext(activeFrame);

    return () => {
      if (intervalRef.current) clearTimeout(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, frames.length, cycleDuration]);

  // Animate frame transitions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ceceEls = container.querySelectorAll<HTMLElement>(".montage-cece");
    const alexEls = container.querySelectorAll<HTMLElement>(".montage-alex");

    ceceEls.forEach((el, i) => {
      if (i === activeFrame) {
        gsap.fromTo(el,
          { opacity: 0, x: 30, scale: 0.9 },
          { opacity: 1, x: 0, scale: 1, duration: 0.8, ease: "back.out(1.2)", force3D: true }
        );
      } else {
        gsap.to(el, { opacity: 0, duration: 0.4, ease: "power2.in" });
      }
    });

    alexEls.forEach((el, i) => {
      if (i === activeFrame) {
        gsap.fromTo(el,
          { opacity: 0, x: -30, scale: 0.9 },
          { opacity: 1, x: 0, scale: 1, duration: 0.8, delay: 0.15, ease: "back.out(1.2)", force3D: true }
        );
      } else {
        gsap.to(el, { opacity: 0, duration: 0.4, ease: "power2.in" });
      }
    });
  }, [activeFrame]);

  return (
    <div ref={containerRef} className="absolute inset-0 flex items-center justify-center z-[11] pointer-events-none">
      {/* Full-width video frames (when videoSrc is set) — centered, fully visible */}
      {frames.map((frame, i) => frame.videoSrc ? (
        <img
          key={`video-${i}`}
          src={frame.videoSrc}
          alt=""
          className="montage-cece montage-alex absolute object-contain"
          style={{
            opacity: i === 0 ? 1 : 0,
            top: "10%",
            left: "10%",
            width: "80%",
            height: "75%",
            filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.5))",
          }}
        />
      ) : null)}

      {/* Alex on the left (for image-pair frames only) */}
      <div className="absolute" style={{ left: "5%", top: "15%", width: "40%", height: "65%" }}>
        {frames.map((frame, i) => !frame.videoSrc ? (
          <img
            key={`alex-${i}`}
            src={frame.alexSrc}
            alt=""
            className="montage-alex absolute inset-0 w-full h-full object-contain object-bottom"
            style={{
              opacity: i === 0 ? 1 : 0,
              filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.5))",
            }}
          />
        ) : null)}
      </div>

      {/* Cece on the right (for image-pair frames only) */}
      <div className="absolute" style={{ right: "5%", top: "10%", width: "45%", height: "70%" }}>
        {frames.map((frame, i) => !frame.videoSrc ? (
          <img
            key={`cece-${i}`}
            src={frame.ceceSrc}
            alt=""
            className="montage-cece absolute inset-0 w-full h-full object-contain object-bottom"
            style={{
              opacity: i === 0 ? 1 : 0,
              filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.5))",
            }}
          />
        ) : null)}
      </div>

    </div>
  );
}
