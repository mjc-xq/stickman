"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import type { Container, ISourceOptions } from "@tsparticles/engine";
import { loadSlim } from "@tsparticles/slim";
import { usePointer, pointerToScreen } from "@/app/hooks/stickman";

const PARTICLE_OPTIONS: ISourceOptions = {
  background: { color: "#050510" },
  fpsLimit: 60,
  fullScreen: false,
  particles: {
    number: { value: 500, density: { enable: true } },
    color: {
      value: ["#ffffff", "#b0c4ff", "#8fa8e6", "#c8b8ff", "#6688cc"],
    },
    shape: { type: "circle" },
    opacity: {
      value: { min: 0.1, max: 0.85 },
      animation: {
        enable: true,
        speed: 0.4,
        sync: false,
        startValue: "random",
      },
    },
    size: { value: { min: 0.3, max: 2.8 } },
    links: {
      enable: true,
      distance: 150,
      color: "#4a6ab5",
      opacity: 0.25,
      width: 0.8,
    },
    move: {
      enable: true,
      speed: 1.2,
      direction: "none",
      outModes: { default: "bounce" },
      random: true,
      straight: false,
    },
  },
  interactivity: {
    detectsOn: "canvas",
    events: {
      onHover: { enable: true, mode: "repulse" },
    },
    modes: {
      repulse: {
        distance: 100,
        duration: 0.4,
        speed: 0.5,
      },
    },
  },
};

export function ConstellationViz() {
  const pointer = usePointer();
  const [ready, setReady] = useState(false);
  const containerRef = useRef<Container | null>(null);

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setReady(true))
      .catch(console.error);
  }, []);

  // Pump the virtual pointer into the container each frame
  useEffect(() => {
    if (!ready) return;
    let id: number;
    const update = () => {
      const c = containerRef.current;
      const norm = pointer.current;
      if (c && norm) {
        const el = c.canvas.element;
        if (el) {
          const w = el.offsetWidth;
          const h = el.offsetHeight;
          const pxr = c.retina.pixelRatio ?? window.devicePixelRatio ?? 1;
          const screen = pointerToScreen(norm, w, h);
          c.interactivity.mouse.position = {
            x: screen.x * pxr,
            y: screen.y * pxr,
          };
          c.interactivity.status = "pointermove";
        }
      }
      id = requestAnimationFrame(update);
    };
    id = requestAnimationFrame(update);
    return () => cancelAnimationFrame(id);
  }, [ready, pointer]);

  const particlesLoaded = useCallback(async (container?: Container) => {
    if (container) containerRef.current = container;
  }, []);

  if (!ready) return null;

  return (
    <Particles
      id="constellation"
      particlesLoaded={particlesLoaded}
      className="absolute inset-0 w-full h-full"
      options={PARTICLE_OPTIONS}
    />
  );
}
