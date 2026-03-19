/**
 * Generate split foreground images for multi-piece animations.
 * Each character generated separately on white, processed to transparent.
 *
 * Slide 3: Alex (right) + Cece (left) + wand sparkles (center)
 * Slide 5: Alex (left) + Cece (right) + wand glow with tiny Cece (center)
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

const OUTPUT_DIR = path.join(ROOT, "public/images/story/split");
const REFERENCE_IMAGE = path.join(ROOT, "public/images/reference-color.png");
const ALEX_REFERENCE = path.join(ROOT, "public/images/Alex-Russo-alex-russo-16110429-427-640.webp");
const WAND_FRONT = path.join(ROOT, "public/images/wand-front.jpg");
const WAND_BACK = path.join(ROOT, "public/images/wand-back.jpg");
const MODEL = "gemini-3.1-flash-image-preview";

const FG_STYLE = `STYLE: Bold cartoon/comic art style. Strong black outlines, flat vibrant colors, very expressive.
BACKGROUND: Pure WHITE background. No scenery, no ground, no shadows on the ground. Character floats on white.
DO NOT include any text, words, or labels.
IMPORTANT: ONE single illustration, NOT multiple panels. ONLY the described character — no other characters.
`;

const CHARACTER_CECE = `CECE (match reference image EXACTLY):
- Brown skin (EXACT same tone as reference)
- Locs/dreadlocks hairstyle (EXACT same style and color)
- Round glasses
- Purple wizard hat on top of her head
- Purple t-shirt and blue jeans
`;

const CHARACTER_ALEX = `ALEX RUSSO (match reference photo EXACTLY):
- Long straight dark brown hair
- Olive skin
- Confident expression
- Teen girl, slightly older than Cece
- Wearing a stylish striped outfit
`;

const WAND_DESC = `THE WAND (match reference photos):
- Black ornate body with dark gothic/organic sculptural texture
- Gold dragon with spread wings wrapped around the middle
- Large pink/rose quartz crystal POINT on the top
- Small yellow rectangular screen embedded in the shaft
- Round clear crystal ball at the bottom
- Various gemstones along the shaft
`;

const PIECES = [
  // Slide 3 — Alex giving wand to Cece
  {
    name: "s03-alex",
    refs: ["alex", "wand"],
    prompt: `${FG_STYLE}${CHARACTER_ALEX}${WAND_DESC}
SCENE: Alex Russo ALONE, kneeling down on one knee, holding out the ornate wand (matching reference) toward the left side of the frame. She has a warm encouraging smile. Her right arm extends the wand outward. Full body, kneeling pose. On pure WHITE background. ONLY ALEX — no other characters.`,
  },
  {
    name: "s03-cece",
    refs: ["cece"],
    prompt: `${FG_STYLE}${CHARACTER_CECE}
SCENE: Cece ALONE, standing and looking to the right with wide amazed eyes. Her hands are slightly reaching forward, about to receive something. She looks excited and awestruck. Full body standing pose, slightly leaning forward. On pure WHITE background. ONLY CECE — no other characters.`,
  },
  {
    name: "s03-sparkles",
    refs: ["wand"],
    prompt: `${FG_STYLE}
SCENE: A burst of magical sparkles and glowing energy. Purple, gold, and white sparkle particles radiating outward from a central point. Magical swirls of light. Tiny stars and glitter. No characters, no wand — JUST the sparkle/glow effect itself floating in space. On pure WHITE background. Abstract magical energy only.`,
  },

  // Slide 5 — Alex and Cece, family love, tiny Cece in wand
  {
    name: "s05-alex",
    refs: ["alex"],
    prompt: `${FG_STYLE}${CHARACTER_ALEX}
SCENE: Alex Russo ALONE, standing and facing right. She has one arm extended as if it's around someone's shoulders (the other person is not in this image). She's explaining something with her other hand gesturing. Warm, mentoring expression. Full body. On pure WHITE background. ONLY ALEX.`,
  },
  {
    name: "s05-cece",
    refs: ["cece", "wand"],
    prompt: `${FG_STYLE}${CHARACTER_CECE}${WAND_DESC}
SCENE: Cece ALONE, standing and facing left, holding the ornate wand (matching reference) in both hands carefully. She's looking down at the wand with wonder and love. Full body, gentle pose. On pure WHITE background. ONLY CECE.`,
  },
  {
    name: "s05-tinycece",
    refs: ["cece"],
    prompt: `${FG_STYLE}${CHARACTER_CECE}
SCENE: A TINY fairy-sized version of Cece (about 3 inches tall), floating in a bubble of golden magical light. She wears the same outfit — purple wizard hat, purple shirt, blue jeans, round glasses, locs. She's waving happily with a big smile. Little hearts and sparkles surround her. The golden light bubble glows warmly. On pure WHITE background. Just the tiny fairy Cece in her glow bubble — nothing else.`,
  },
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function processToTransparent(inputPath, outputPath) {
  try {
    execSync(
      `magick "${inputPath}" ` +
        `-bordercolor white -border 1 ` +
        `-alpha set ` +
        `-fuzz 18% -fill none -draw "color 0,0 floodfill" ` +
        `-shave 1x1 ` +
        `-trim +repage ` +
        `"${outputPath}"`,
      { stdio: "pipe" }
    );
    return true;
  } catch (e) {
    console.error(`  Processing failed: ${e.message}`);
    return false;
  }
}

async function generate(ai, prompt, refs, refImages) {
  const imageParts = [];
  for (const refKey of refs) {
    if (refImages[refKey]) {
      imageParts.push({
        inlineData: { mimeType: refImages[refKey].mime, data: refImages[refKey].base64 },
      });
    }
  }

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [...imageParts, { text: prompt }] }],
    config: { responseModalities: ["TEXT", "IMAGE"] },
  });

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data;
  }
  return null;
}

async function main() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) { console.error("Missing API key"); process.exit(1); }

  const refImages = {};
  const loadRef = (key, filePath, mime) => {
    if (fs.existsSync(filePath)) {
      refImages[key] = { base64: fs.readFileSync(filePath).toString("base64"), mime };
      console.log(`  Loaded: ${key}`);
    }
  };
  loadRef("cece", REFERENCE_IMAGE, "image/png");
  loadRef("alex", ALEX_REFERENCE, "image/webp");
  loadRef("wand", WAND_FRONT, "image/jpeg");
  loadRef("wand2", WAND_BACK, "image/jpeg");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const ai = new GoogleGenAI({ apiKey });
  let success = 0, fail = 0;

  for (let i = 0; i < PIECES.length; i++) {
    const piece = PIECES[i];
    const progress = `[${i + 1}/${PIECES.length}]`;
    const rawPath = path.join(OUTPUT_DIR, `${piece.name}-raw.png`);
    const outPath = path.join(OUTPUT_DIR, `${piece.name}.png`);

    console.log(`${progress} Generating: ${piece.name}...`);
    try {
      const refs = [...piece.refs];
      if (refs.includes("wand") && refImages.wand2) refs.push("wand2");
      const data = await generate(ai, piece.prompt, refs, refImages);
      if (data) {
        fs.writeFileSync(rawPath, Buffer.from(data, "base64"));
        if (processToTransparent(rawPath, outPath)) {
          console.log(`${progress} OK: ${piece.name}.png (transparent)`);
        } else {
          fs.copyFileSync(rawPath, outPath);
          console.log(`${progress} OK: ${piece.name}.png (unprocessed)`);
        }
        success++;
      } else {
        console.log(`${progress} FAIL: no image`);
        fail++;
      }
    } catch (e) {
      console.error(`${progress} ERROR: ${e.message}`);
      fail++;
    }
    if (i < PIECES.length - 1) await sleep(3000);
  }

  // Clean up raw files
  const rawFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith("-raw.png"));
  for (const f of rawFiles) fs.unlinkSync(path.join(OUTPUT_DIR, f));

  console.log(`\n=== Done === Success: ${success} | Failed: ${fail}`);
}

main().catch(err => { console.error(err); process.exit(1); });
