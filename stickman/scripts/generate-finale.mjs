/**
 * Generate finale split pieces + improved backgrounds.
 *
 * Finale slide: Cece hero pose → Alex walks in proud → Huey bounds in excited
 * Also regenerate some backgrounds to better fit scenes.
 */

import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

config({ path: path.join(ROOT, ".env.local") });
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  config({ path: "/Users/mcohen/dev/kiosk-competency/.env.local" });
}

const SPLIT_DIR = path.join(ROOT, "public/images/story/split");
const BG_DIR = path.join(ROOT, "public/images/story");
const REFERENCE = path.join(ROOT, "public/images/reference-color.png");
const ALEX_REF = path.join(ROOT, "public/images/Alex-Russo-alex-russo-16110429-427-640.webp");
const HUEY_REF = path.join(ROOT, "public/images/huey-reference.jpg");
const WAND_REF = path.join(ROOT, "public/images/wand-front.jpg");
const MODEL = "gemini-3.1-flash-image-preview";

const FG_STYLE = `STYLE: Bold cartoon/comic art style. Strong black outlines, flat vibrant colors, very expressive.
BACKGROUND: Pure WHITE background. No scenery, no ground, no shadows.
DO NOT include any text, words, or labels.
ONE single illustration, NOT multiple panels. ONLY the described character(s).
`;

const CECE = `CECE (match reference EXACTLY): Brown skin, locs/dreadlocks, round glasses, purple wizard hat, purple t-shirt, blue jeans.`;
const ALEX = `ALEX RUSSO (match reference EXACTLY): Long straight dark brown hair, olive skin, teen girl, stylish striped outfit.`;
const HUEY = `HUEY (match reference photo EXACTLY): Chunky tan/fawn bully breed dog, wrinkly face, big head, cropped ears, stocky muscular build, pink tongue hanging out. Match the dog in the reference photo exactly.`;
const WAND = `THE WAND: Black ornate body, gold dragon with wings, pink crystal point on top, yellow screen, crystal ball at bottom, gemstones along shaft.`;

const PIECES = [
  // Finale: Cece center hero pose (wand raised triumphant)
  {
    name: "finale-cece-hero",
    dir: SPLIT_DIR,
    refs: ["cece", "wand"],
    prompt: `${FG_STYLE}${CECE}${WAND}
POSE: Cece standing tall and confident, holding the ornate wand high above her head in triumph. Her other fist is pumped at her side. She has the biggest, proudest grin. Wizard hat sits perfectly. Locs blow in magical wind. Full body, heroic powerful stance. Pure white background. ONLY CECE.`,
  },
  // Finale: Cece looking at wand tenderly
  {
    name: "finale-cece-wand",
    dir: SPLIT_DIR,
    refs: ["cece", "wand"],
    prompt: `${FG_STYLE}${CECE}${WAND}
POSE: Cece holding the wand in both hands at chest height, looking down at it with love and wonder. The wand's pink crystal tip glows softly. She has a gentle, grateful smile — like she's just received the best gift ever. Full body, calm tender pose. Pure white background. ONLY CECE.`,
  },
  // Finale: Alex walking in, proud clapping
  {
    name: "finale-alex-proud",
    dir: SPLIT_DIR,
    refs: ["alex"],
    prompt: `${FG_STYLE}${ALEX}
POSE: Alex Russo walking toward the right, mid-stride. She is clapping her hands with a proud, warm smile. She looks like a big sister who just watched her little sister nail a talent show. Confident posture, one foot forward. Full body walking pose. Pure white background. ONLY ALEX.`,
  },
  // Finale: Huey bounding in excited
  {
    name: "finale-huey-run",
    dir: SPLIT_DIR,
    refs: ["huey"],
    prompt: `${FG_STYLE}${HUEY}
POSE: The chunky tan bully breed dog (match reference EXACTLY) running/bounding toward the LEFT in pure excitement. All four paws off the ground mid-leap, tongue flapping, ears bouncing, tail wagging like crazy. He is SO happy. Full body, dynamic running pose. Pure white background. ONLY THE DOG.`,
  },
  // Finale: Huey sitting happy looking up
  {
    name: "finale-huey-sit",
    dir: SPLIT_DIR,
    refs: ["huey"],
    prompt: `${FG_STYLE}${HUEY}
POSE: The chunky tan bully breed dog (match reference EXACTLY) sitting down obediently, looking up with big adoring eyes and tongue out. Tail wagging on the ground. He is gazing up at someone he loves. Sitting pose facing slightly left. Pure white background. ONLY THE DOG.`,
  },
  // Better BG: Slide 4 (FLASH moment — magical energy explosion)
  {
    name: "slide-04-bg",
    dir: BG_DIR,
    refs: [],
    prompt: `STYLE: Rich painterly fantasy environment. Vibrant watercolor-like colors with magical glowing lighting.
DO NOT include any characters, people, or animals. Environment ONLY. DO NOT include any text.
SCENE: An EXPLOSION of magical energy filling the entire frame. Brilliant purple, gold, and white light radiating outward from the center. Lightning-like magical bolts. Swirling vortex of sparkles and starlight. The moment of a powerful magical event. Intense, dramatic, beautiful. Landscape orientation.`,
  },
  // Better BG: Slide 6 (hold button / remote mode — Waverly Place substation)
  {
    name: "slide-07-bg",
    dir: BG_DIR,
    refs: [],
    prompt: `STYLE: Rich painterly fantasy environment. Vibrant watercolor-like colors with magical glowing lighting.
DO NOT include any characters, people, or animals. Environment ONLY. DO NOT include any text.
SCENE: A magical underground lair that looks like a cross between a wizard's workshop and a teen hangout. Stone walls with glowing runes, a workbench with magical tools and crystals, a cozy couch, string lights mixed with floating magical orbs. A large crystal ball sits on a table glowing. It feels like the secret substation from Wizards of Waverly Place — magical but also cozy and personal. Night sky visible through a skylight. Landscape orientation.`,
  },
  // Better BG: Finale slide (more epic, wider)
  {
    name: "slide-10-bg",
    dir: BG_DIR,
    refs: [],
    prompt: `STYLE: Rich painterly fantasy environment. Vibrant watercolor-like colors with magical glowing lighting. EPIC scale.
DO NOT include any characters, people, or animals. Environment ONLY. DO NOT include any text.
SCENE: The most spectacular magical vista imaginable. A hilltop clearing bathed in a column of brilliant golden-white light shooting up from the ground into a sky filled with swirling auroras of purple, magenta, gold, and teal. Stars cascade like a waterfall from the light beam. In the sky, magical constellations form the shapes of a wand, a star, and a heart. Mountains and forests stretch into the distance under the aurora. The sky is ALIVE with magic. This is a coronation moment. Landscape orientation, extremely wide.`,
  },
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function processToTransparent(inputPath, outputPath) {
  try {
    execSync(
      `magick "${inputPath}" -bordercolor white -border 1 -alpha set ` +
        `-fuzz 18% -fill none -draw "color 0,0 floodfill" -shave 1x1 ` +
        `-trim +repage "${outputPath}"`,
      { stdio: "pipe" }
    );
    return true;
  } catch { return false; }
}

async function generate(ai, prompt, refs, refImages) {
  const parts = [];
  for (const key of refs) {
    if (refImages[key]) parts.push({ inlineData: { mimeType: refImages[key].mime, data: refImages[key].b64 } });
  }
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [...parts, { text: prompt }] }],
    config: { responseModalities: ["TEXT", "IMAGE"] },
  });
  for (const part of response?.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) return part.inlineData.data;
  }
  return null;
}

async function main() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) { console.error("Missing API key"); process.exit(1); }

  const refImages = {};
  const load = (key, p, mime) => {
    if (fs.existsSync(p)) { refImages[key] = { b64: fs.readFileSync(p).toString("base64"), mime }; console.log(`  Loaded: ${key}`); }
  };
  load("cece", REFERENCE, "image/png");
  load("alex", ALEX_REF, "image/webp");
  load("huey", HUEY_REF, "image/jpeg");
  load("wand", WAND_REF, "image/jpeg");

  fs.mkdirSync(SPLIT_DIR, { recursive: true });
  const ai = new GoogleGenAI({ apiKey });
  let success = 0, fail = 0;

  for (let i = 0; i < PIECES.length; i++) {
    const piece = PIECES[i];
    const progress = `[${i + 1}/${PIECES.length}]`;
    const isBg = piece.dir === BG_DIR;
    const rawPath = path.join(piece.dir, `${piece.name}-raw.png`);
    const outPath = path.join(piece.dir, `${piece.name}.png`);

    console.log(`${progress} Generating: ${piece.name}...`);
    try {
      const data = await generate(ai, piece.prompt, piece.refs, refImages);
      if (data) {
        fs.writeFileSync(rawPath, Buffer.from(data, "base64"));
        if (isBg) {
          // Backgrounds: just rename, no transparency processing
          fs.renameSync(rawPath, outPath);
          console.log(`${progress} OK: ${piece.name}.png`);
        } else if (processToTransparent(rawPath, outPath)) {
          fs.unlinkSync(rawPath);
          console.log(`${progress} OK: ${piece.name}.png (transparent)`);
        } else {
          fs.renameSync(rawPath, outPath);
          console.log(`${progress} OK: ${piece.name}.png (unprocessed)`);
        }
        success++;
      } else { console.log(`${progress} FAIL: no image`); fail++; }
    } catch (e) { console.error(`${progress} ERROR: ${e.message}`); fail++; }
    if (i < PIECES.length - 1) await sleep(3000);
  }

  console.log(`\nDone. Success: ${success} | Failed: ${fail}`);
}

main().catch(err => { console.error(err); process.exit(1); });
