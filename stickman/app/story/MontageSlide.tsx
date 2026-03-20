"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

export interface MontageFrame {
  ceceSrc: string;
  alexSrc: string;
  videoSrc?: string;
}

interface MontageSlideProps {
  frames: MontageFrame[];
  isActive: boolean;
  cycleDuration?: number;
}

/**
 * Cycles through paired Cece+Alex images and full-frame videos.
 * Videos use <video> with mix-blend-mode:multiply for performance.
 * Each frame is rendered with a data-frame index for correct animation targeting.
 */
export function MontageSlide({ frames, isActive, cycleDuration = 3.5 }: MontageSlideProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeFrame, setActiveFrame] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cycle frames when active — videos get 9s, images get cycleDuration
  useEffect(() => {
    if (!isActive) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setActiveFrame(0);
      return;
    }

    const scheduleNext = (currentIdx: number) => {
      const isVideo = !!frames[currentIdx]?.videoSrc;
      const delay = isVideo ? 9000 : cycleDuration * 1000;
      timeoutRef.current = setTimeout(() => {
        const next = (currentIdx + 1) % frames.length;
        setActiveFrame(next);
        scheduleNext(next);
      }, delay);
    };
    scheduleNext(activeFrame);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, frames.length, cycleDuration]);

  // Animate frame transitions using data-frame attributes (fixes DOM indexing bug)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Animate ALL elements by their data-frame attribute
    frames.forEach((_, i) => {
      const els = container.querySelectorAll<HTMLElement>(`[data-frame="${i}"]`);
      els.forEach(el => {
        if (i === activeFrame) {
          // Restart videos on activation
          if (el instanceof HTMLVideoElement) {
            el.currentTime = 0;
            el.play().catch(() => {});
          }
          gsap.fromTo(el,
            { opacity: 0, scale: 0.95 },
            { opacity: 1, scale: 1, duration: 0.6, ease: "power2.out", force3D: true }
          );
        } else {
          gsap.to(el, { opacity: 0, duration: 0.3, ease: "power2.in", force3D: true });
        }
      });
    });
  }, [activeFrame, frames]);

  return (
    <div ref={containerRef} className="absolute inset-0 z-[11] pointer-events-none">
      {frames.map((frame, i) => {
        if (frame.videoSrc) {
          // Full-frame video — hardware decoded with multiply blend
          return (
            <img
              key={`video-${i}`}
              data-frame={i}
              src={frame.videoSrc}
              alt=""
              loading={i <= 1 ? "eager" : "lazy"}
              className="absolute object-contain"
              style={{
                opacity: i === 0 ? 1 : 0,
                top: "10%", left: "10%", width: "80%", height: "75%",
                filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.5))",
                willChange: "transform, opacity",
              }}
            />
          );
        }
        // Image pair — Alex left, Cece right
        return (
          <div key={`pair-${i}`} className="absolute inset-0">
            <img
              data-frame={i}
              src={frame.alexSrc}
              alt=""
              className="absolute object-contain object-bottom"
              loading={i <= 1 ? "eager" : "lazy"}
              style={{
                opacity: i === 0 ? 1 : 0,
                left: "5%", top: "15%", width: "40%", height: "65%",
                filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.5))",
                willChange: "transform, opacity",
              }}
            />
            <img
              data-frame={i}
              src={frame.ceceSrc}
              alt=""
              className="absolute object-contain object-bottom"
              loading={i <= 1 ? "eager" : "lazy"}
              style={{
                opacity: i === 0 ? 1 : 0,
                right: "5%", top: "10%", width: "45%", height: "70%",
                filter: "drop-shadow(0 6px 20px rgba(0,0,0,0.5))",
                willChange: "transform, opacity",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
