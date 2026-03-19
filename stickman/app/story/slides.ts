export interface SplitPiece {
  src: string;
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
  effect?: "shooting-star" | "flash" | "sparkle-burst";
  effectTriggerWord?: string;
  fairyTriggerWord?: string; // triggers fairy flight animation when typed
  isTitle?: boolean; // renders as title card instead of story slide
  floatingBubble?: boolean; // shows floating bubble Cece animation
  montage?: { ceceSrc: string; alexSrc: string }[]; // cycling image pairs
  // Multi-piece foreground (replaces single fg when present)
  splitFg?: SplitPiece[];
}

export const STORY_SLIDES: Slide[] = [
  {
    lines: [
      "Cece and the Chaos Wand",
      "A Birthday Adventure",
    ],
    bg: "/images/story/slide-01-bg.png",
    fg: "/images/story/split/title-group.png",
    isTitle: true,
  },
  {
    lines: [
      "A signal. A birthday star — blazing across the sky.",
      "\"It's choosing someone,\" Alex said. \"Someone powerful.\"",
    ],
    bg: "/images/story/slide-02-bg.png",
    fg: "/images/story/slide-02-fg.png",
    effect: "shooting-star",
  },
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
  {
    lines: [
      "Press the button to feed her. Hold it to control the TV.",
      "But mostly — just have fun.",
    ],
    bg: "/images/story/montage-bg.png",
    fg: "/images/story/slide-06-fg.png",
    montage: [
      { ceceSrc: "/images/story/split/montage-cece-zap.png", alexSrc: "/images/story/split/montage-alex-wow.png" },
      { ceceSrc: "/images/story/split/montage-cece-levitate.png", alexSrc: "/images/story/split/montage-alex-laugh.png" },
      { ceceSrc: "/images/story/split/montage-cece-rain.png", alexSrc: "/images/story/split/montage-alex-proud.png" },
    ],
  },
  {
    lines: [
      "Cece — you're the family wizard now. The magic is yours.",
      "And you're going to do great.",
    ],
    bg: "/images/story/slide-10-bg.png",
    fg: "/images/story/slide-10-fg.png",
    splitFg: [
      {
        // Cece: rises up center with wand
        src: "/images/story/split/finale-cece-wand.png",
        toX: 0, toY: 5, toScale: 1,
        fromX: 0, fromY: 120, fromScale: 0.7, fromRotate: 0,
        delay: 0, duration: 2.0, ease: "power3.out",
        maxH: "50dvh",
      },
      {
        // Huey: runs from background (starts tiny, grows, ends off-screen right)
        src: "/images/story/split/finale-huey-run.png",
        toX: 70, toY: 25, toScale: 0.9,
        fromX: 0, fromY: -20, fromScale: 0.06, fromRotate: 0,
        delay: 2.0, duration: 2.5, ease: "power1.in",
        maxH: "28dvh",
      },
      {
        // Alex: clapping, walks in from left — prominent, close to Cece
        src: "/images/story/split/finale-alex-clap.png",
        toX: -22, toY: 3, toScale: 0.95,
        fromX: -300, fromY: 15, fromScale: 0.85, fromRotate: -2,
        delay: 3.5, duration: 2.0, ease: "power2.out",
        maxH: "50dvh",
      },
    ],
  },
];
