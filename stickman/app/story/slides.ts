export interface SplitPiece {
  src: string;
  video?: string;  // optional animated WebP — replaces static image, plays once then holds last frame
  // Where the piece ENDS (final resting position, % of container)
  toX: number;     // final left position as % (0 = center, -40 = far left, 40 = far right)
  toY: number;     // final top position as % (0 = center)
  toScale: number; // final scale
  // Where the piece STARTS (before animation, offset from final position)
  fromX: number;   // px offset from final position
  fromY: number;
  fromScale: number;
  fromRotate: number;
  // Animation timing
  delay: number;   // seconds delay from fg entrance start
  duration: number; // seconds
  ease: string;    // GSAP ease name
  maxH: string;    // max-height CSS value
}

export interface Slide {
  lines: [string, string];
  bg: string;
  fg: string;
  fgVideo?: string; // optional animated WebP to replace single fg image
  effect?: "shooting-star" | "flash" | "sparkle-burst";
  effectTriggerWord?: string;
  fairyTriggerWord?: string; // triggers fairy flight animation when typed
  isTitle?: boolean; // renders as title card instead of story slide
  floatingBubble?: boolean; // shows floating bubble Cece animation
  montage?: { ceceSrc: string; alexSrc: string; videoSrc?: string }[]; // cycling image/video pairs
  // Multi-piece foreground (replaces single fg when present)
  splitFg?: SplitPiece[];
}

export const STORY_SLIDES: Slide[] = [
  // ── Slide 01: Title Card ──────────────────────────────────────────
  {
    lines: [
      "Cece and the Chaos Wand",
      "A Birthday Adventure",
    ],
    bg: "/images/story/slide-01-bg.png",
    fg: "/images/story/split/title-group.png",
    fgVideo: "/videos/animated/intro-all-laughing.webp",
    isTitle: true,
  },

  // ── Slide 02: Birthday Star ───────────────────────────────────────
  {
    lines: [
      "A signal. A birthday star — blazing across the sky.",
      "\"It's choosing someone,\" Alex said. \"Someone powerful.\"",
    ],
    bg: "/images/story/slide-02-bg.png",
    fg: "/images/story/slide-02-fg.png",
    fgVideo: "/videos/animated/slide02-alex-speaking.webp",
    effect: "shooting-star",
  },

  // ── Slide 03: Wand Transfer ───────────────────────────────────────
  // Alex gives the wand to Cece. Three pieces enter sequentially.
  // Keep static images — the GSAP choreography IS the animation here.
  {
    lines: [
      "She tracked the star straight to Cece.",
      "\"This wand was never really mine. The magic is in YOU.\"",
    ],
    bg: "/images/story/slide-03-bg.png",
    fg: "/images/story/slide-03-fg.png",
    effect: "sparkle-burst",
    splitFg: [
      {
        // Cece: already in place on the left, just fades in immediately
        src: "/images/story/split/s03-cece.png",
        toX: -28, toY: 5, toScale: 1,
        fromX: 0, fromY: 20, fromScale: 0.9, fromRotate: 0,
        delay: 0, duration: 1.0, ease: "power2.out",
        maxH: "45dvh",
      },
      {
        // Sparkle/star: flies in from top-right toward Cece, growing
        src: "/images/story/split/s03-sparkles.png",
        toX: -5, toY: -10, toScale: 0.8,
        fromX: 350, fromY: -200, fromScale: 0.1, fromRotate: 180,
        delay: 0.8, duration: 2.0, ease: "power2.inOut",
        maxH: "20dvh",
      },
      {
        // Alex: follows the star in from the right, arriving after it
        src: "/images/story/split/s03-alex.png",
        toX: 28, toY: 0, toScale: 1,
        fromX: 400, fromY: -80, fromScale: 0.6, fromRotate: 3,
        delay: 1.5, duration: 2.0, ease: "power2.out",
        maxH: "50dvh",
      },
    ],
  },

  // ── Slide 04: The Flash ───────────────────────────────────────────
  // Cece touches the wand — FLASH — tiny fairy appears inside.
  {
    lines: [
      "The second Cece touched the wand — FLASH.",
      "A tiny version of herself appeared inside, waving back at her!",
    ],
    bg: "/images/story/slide-04-bg.png",
    fg: "/images/story/slide-04-fg.png",
    effect: "flash",
    effectTriggerWord: "FLASH",
    fairyTriggerWord: "FLASH",
  },

  // ── Slide 05: The Button ──────────────────────────────────────────
  // Tiny Cece inside the wand, powered by family love.
  // Cece piece replaced with animated tiny-Cece-in-bubble video.
  {
    lines: [
      "\"That tiny you is powered by your family's love.",
      "Press the button to feed her snacks and keep her happy!\"",
    ],
    bg: "/images/story/slide-05-bg.png",
    fg: "/images/story/slide-05-fg.png",
    floatingBubble: true,
    splitFg: [
      {
        src: "/images/story/split/s05-alex.png",
        toX: -25, toY: 0, toScale: 1,
        fromX: -220, fromY: 50, fromScale: 0.7, fromRotate: -4,
        delay: 0, duration: 1.8, ease: "back.out(1.3)",
        maxH: "50dvh",
      },
      {
        src: "/images/story/split/s05-cece.png",
        toX: 25, toY: 5, toScale: 1,
        fromX: 220, fromY: 50, fromScale: 0.7, fromRotate: 4,
        delay: 0.25, duration: 1.8, ease: "back.out(1.3)",
        maxH: "45dvh",
      },
    ],
  },

  // ── Slide 06: Montage ─────────────────────────────────────────────
  // Cece doing magic — cycling image pairs.
  // Levitate frame replaced with animated levitation video.
  {
    lines: [
      "Press the button to feed her. Hold it to control the TV.",
      "But mostly — just have fun.",
    ],
    bg: "/images/story/montage-bg.png",
    fg: "/images/story/slide-06-fg.png",
    montage: [
      { ceceSrc: "/images/story/split/montage-cece-zap.png", alexSrc: "/images/story/split/montage-alex-wow.png" },
      { ceceSrc: "", alexSrc: "", videoSrc: "/videos/animated/cece-levitate.webp" },
      { ceceSrc: "/images/story/split/montage-cece-levitate.png", alexSrc: "/images/story/split/montage-alex-laugh.png" },
      { ceceSrc: "", alexSrc: "", videoSrc: "/videos/animated/cece-turns-alex-cat.webp" },
      { ceceSrc: "/images/story/split/montage-cece-rain.png", alexSrc: "/images/story/split/montage-alex-proud.png" },
      { ceceSrc: "", alexSrc: "", videoSrc: "/videos/animated/cece-wand-point.webp" },
    ],
  },

  // ── Slide 07: Finale ──────────────────────────────────────────────
  // "You're the family wizard now." Three characters enter sequentially.
  // Cece: animated wand-point (hero moment, pointing wand at viewer)
  // Alex: animated high-five with Cece (celebration)
  {
    lines: [
      "Cece — you're the family wizard now. The magic is yours.",
      "And you're going to do great.",
    ],
    bg: "/images/story/slide-10-bg.png",
    fg: "/images/story/slide-10-fg.png",
    splitFg: [
      {
        // Cece: rises up center — animated wand point (the hero moment)
        src: "/images/story/split/finale-cece-wand.png",
        video: "/videos/animated/cece-wand-point.webp",
        toX: -15, toY: 5, toScale: 1,
        fromX: 0, fromY: 120, fromScale: 0.7, fromRotate: 0,
        delay: 0, duration: 2.0, ease: "power3.out",
        maxH: "48dvh",
      },
      {
        // Alex: animated high-five celebration (enters from right)
        src: "/images/story/split/finale-alex-clap.png",
        video: "/videos/animated/cece-alex-highfive.webp",
        toX: 20, toY: 3, toScale: 0.9,
        fromX: 300, fromY: 15, fromScale: 0.85, fromRotate: 2,
        delay: 2.0, duration: 2.0, ease: "power2.out",
        maxH: "48dvh",
      },
    ],
  },
];
