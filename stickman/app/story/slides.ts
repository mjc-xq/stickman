export interface SplitPiece {
  src: string;
  // Where the piece starts (before animation)
  fromX: number;  // px offset from final position
  fromY: number;
  fromScale: number;
  fromRotate: number;
  // Animation timing
  delay: number;   // seconds delay from fg entrance start
  duration: number; // seconds
  ease: string;    // GSAP ease name
}

export interface Slide {
  lines: [string, string];
  bg: string;
  fg: string;
  effect?: "shooting-star" | "flash" | "sparkle-burst";
  effectTriggerWord?: string;
  // Multi-piece foreground (replaces single fg when present)
  splitFg?: SplitPiece[];
}

export const STORY_SLIDES: Slide[] = [
  {
    lines: [
      "Something was wrong at the Wizard Lair.",
      "Alex Russo's wand wouldn't stop glowing.",
    ],
    bg: "/images/story/slide-01-bg.png",
    fg: "/images/story/slide-01-fg.png",
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
        src: "/images/story/split/s03-alex.png",
        fromX: 200, fromY: 40, fromScale: 0.85, fromRotate: 3,
        delay: 0, duration: 1.2, ease: "back.out(1.2)",
      },
      {
        src: "/images/story/split/s03-cece.png",
        fromX: -200, fromY: 40, fromScale: 0.85, fromRotate: -3,
        delay: 0.15, duration: 1.2, ease: "back.out(1.2)",
      },
      {
        src: "/images/story/split/s03-sparkles.png",
        fromX: 0, fromY: 0, fromScale: 0, fromRotate: 0,
        delay: 0.6, duration: 0.8, ease: "elastic.out(1, 0.5)",
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
  },
  {
    lines: [
      "\"That tiny you is powered by your family's love.",
      "Press the button to feed her snacks and keep her happy!\"",
    ],
    bg: "/images/story/slide-05-bg.png",
    fg: "/images/story/slide-05-fg.png",
    splitFg: [
      {
        src: "/images/story/split/s05-alex.png",
        fromX: -180, fromY: 30, fromScale: 0.9, fromRotate: -2,
        delay: 0, duration: 1.1, ease: "back.out(1.3)",
      },
      {
        src: "/images/story/split/s05-cece.png",
        fromX: 180, fromY: 30, fromScale: 0.9, fromRotate: 2,
        delay: 0.12, duration: 1.1, ease: "back.out(1.3)",
      },
      {
        src: "/images/story/split/s05-tinycece.png",
        fromX: 0, fromY: -50, fromScale: 0, fromRotate: 0,
        delay: 0.7, duration: 1.0, ease: "elastic.out(1, 0.4)",
      },
    ],
  },
  {
    lines: [
      "\"And hold the button down to turn it into a REMOTE.",
      "Then tap the wand to control the TV. Tilt it to pick what you want!\"",
    ],
    bg: "/images/story/slide-07-bg.png",
    fg: "/images/story/slide-07-fg.png",
  },
  {
    lines: [
      "Cece held the button. The wand hummed — \"Remote Mode.\"",
      "She tapped it once. Dragons exploded out of the TV.",
    ],
    bg: "/images/story/slide-06-bg.png",
    fg: "/images/story/slide-06-fg.png",
  },
  {
    lines: [
      "Cece — you're the family wizard now. The magic is yours.",
      "And you're going to do great.",
    ],
    bg: "/images/story/slide-10-bg.png",
    fg: "/images/story/slide-10-fg.png",
  },
];
