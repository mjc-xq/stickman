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
  titleDropDown?: boolean; // title text drops from above instead of sliding up
  floatingBubble?: boolean; // shows floating bubble Cece animation
  montage?: { ceceSrc: string; alexSrc: string; videoSrc?: string }[]; // cycling image/video pairs
  // Multi-piece foreground (replaces single fg when present)
  splitFg?: SplitPiece[];
}

export const STORY_SLIDES: Slide[] = [
  // ── Slide 00: Wizards Intro ─────────────────────────────────────
  // Alex slides left, Cece slides right, crystal ball rises, title drops
  {
    lines: [
      "Wizards of Dahill Ln",
      "",
    ],
    bg: "/images/story/intro-curtain-bg.png",
    fg: "/images/story/split/intro-crystal-ball.png",
    isTitle: true,
    titleDropDown: true,
    splitFg: [
      {
        // Alex: slides in from the left
        src: "/images/story/split/intro-alex.png",
        toX: -30, toY: 0, toScale: 1,
        fromX: -500, fromY: 0, fromScale: 1, fromRotate: 0,
        delay: 0, duration: 1.5, ease: "power2.out",
        maxH: "55dvh",
      },
      {
        // Cece: slides in from the right
        src: "/images/story/split/intro-cece.png",
        toX: 30, toY: 0, toScale: 1,
        fromX: 500, fromY: 0, fromScale: 1, fromRotate: 0,
        delay: 0.4, duration: 1.5, ease: "power2.out",
        maxH: "55dvh",
      },
      {
        // Crystal ball: rises up from below, big, center-front (like the promo shot)
        src: "/images/story/split/intro-crystal-ball.png",
        toX: 0, toY: 20, toScale: 1,
        fromX: 0, fromY: 350, fromScale: 0.6, fromRotate: 0,
        delay: 1.2, duration: 1.8, ease: "back.out(1.3)",
        maxH: "45dvh",
      },
    ],
  },

  // ── Slide 01: Title Card ──────────────────────────────────────────
  {
    lines: [
      "Cece and the Chaos Wand",
      "A Birthday Adventure",
    ],
    bg: "/images/story/slide-01-bg.png",
    fg: "/images/story/split/title-group.png",
    fgVideo: "/videos/mp4/intro-all-laughing.mp4",
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
    fgVideo: "/videos/mp4/slide02-alex-star.mp4",
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
  // Alex teaches Cece magic — images and videos alternate.
  {
    lines: [
      "\"Let me teach you all the wizard ways,\" Alex said to Cece.",
      "And the training began.",
    ],
    bg: "/images/story/montage-bg.png",
    fg: "/images/story/slide-06-fg.png",
    montage: [
      { ceceSrc: "/images/story/split/montage-cece-zap.png", alexSrc: "/images/story/split/montage-alex-wow.png" },
      { ceceSrc: "", alexSrc: "", videoSrc: "/videos/mp4/cece-levitate.mp4" },
      { ceceSrc: "/images/story/split/montage-cece-rain.png", alexSrc: "/images/story/split/montage-alex-proud.png" },
      { ceceSrc: "", alexSrc: "", videoSrc: "/videos/mp4/cece-turns-alex-cat.mp4" },
      { ceceSrc: "/images/story/split/montage-cece-levitate.png", alexSrc: "/images/story/split/montage-alex-laugh.png" },
      { ceceSrc: "", alexSrc: "", videoSrc: "/videos/mp4/cece-alex-highfive.mp4" },
    ],
  },

  // ── Slide 07: Finale ──────────────────────────────────────────────
  // Epic single video: Cece raises wand to the sky, magic erupts
  {
    lines: [
      "Cece — you're the family wizard now. The magic is yours.",
      "And you're going to do great.",
    ],
    bg: "/images/story/slide-10-bg.png",
    fg: "/images/story/split/finale-cece-wand.png",
    fgVideo: "/videos/mp4/finale-epic-wand.mp4",
  },
];
