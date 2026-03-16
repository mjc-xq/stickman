/**
 * Generate color sprite poses for Cece using Gemini image-to-image.
 *
 * Usage:
 *   node scripts/generate-sprite-color.mjs
 *   node scripts/generate-sprite-color.mjs --start-from sleep-1
 *   node scripts/generate-sprite-color.mjs --dry-run
 *   node scripts/generate-sprite-color.mjs --process-only
 *
 * Requires: GOOGLE_GENERATIVE_AI_API_KEY in .env.local
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

const OUTPUT_DIR = path.join(ROOT, "public/images/sprite-color");
const REFERENCE_IMAGE = path.join(ROOT, "public/images/reference-color.png");
const MODEL = "gemini-3.1-flash-image-preview";

// All sprite definitions from SPRITES.md — full body poses
const SPRITES = [
  // Boot / Wake
  { name: "wake-1", desc: "Sitting with eyes closed, head drooping to one side, wizard hat slightly askew, looking drowsy" },
  { name: "wake-2", desc: "Eyes popping open wide, one hand pushing up her glasses, wizard hat straightening on her head, big excited grin" },
  // Sleep
  { name: "sleep-1", desc: "Standing and yawning with mouth wide open, one arm stretching up high, wizard hat tilting back on her head" },
  { name: "sleep-2", desc: "Curled up sitting with head resting on her knees, wizard hat pulled down over her eyes, a single letter Z floating above" },
  // Tap (bonked)
  { name: "tap-annoyed", desc: "Flinching to one side with one eye squinted shut, hand rubbing the top of her wizard hat where she was bonked, annoyed expression" },
  { name: "tap-angry", desc: "Arms crossed with puffed out cheeks, wizard hat knocked sideways, feet planted wide apart in a huff" },
  // Movement
  { name: "move-1", desc: "Stumbling to the left with arms out wide for balance, wizard hat flying off slightly, wide surprised eyes" },
  { name: "move-2", desc: "Stumbling to the right, catching her wizard hat with one hand, surprised startled look" },
  // Toss
  { name: "toss-launch", desc: "Crouching low with knees deeply bent, wizard hat smashed down flat on her head by downward force, cheeks puffed, bracing for liftoff" },
  { name: "toss-air-1", desc: "Floating in mid-air with arms and legs spread wide like a starfish, wizard hat drifting above her head, locs flowing upward, mouth in a perfect wide O of surprise" },
  { name: "toss-air-2", desc: "Floating in mid-air with limbs pulled in tight, eyes squeezed shut, wizard hat drifting even further away, mouth open screaming with a mix of joy and terror" },
  { name: "catch-high", desc: "Landed dramatically in a superhero pose — one knee down, one fist on the ground, wizard hat trailing behind with motion lines, jaw-dropped amazed expression" },
  { name: "catch-high-alt", desc: "Standing triumphantly with both arms raised high in celebration, wizard hat with little stars sparking around its tip, huge open-mouth grin" },
  { name: "catch-med", desc: "Standing proud with one fist pumped, other hand on hip, wizard hat sitting perfectly straight, confident smile with eyes closed" },
  { name: "catch-med-alt", desc: "Doing a happy little hop with one foot kicked back behind her, making a peace sign with one hand, wizard hat bouncing on her head" },
  { name: "catch-low", desc: "Giving a small relieved wave with one hand placed on her chest, gentle grateful smile, wizard hat tilted slightly to one side" },
  { name: "catch-low-alt", desc: "Giving a thumbs up with a soft warm grin, wizard hat sitting securely on her head" },
  { name: "toss-lost-1", desc: "Tumbling and falling upside down in mid-air, wizard hat flying off completely, arms reaching out desperately, panicked wide frightened eyes" },
  { name: "toss-lost-2", desc: "Tumbling further in mid-air with spiral dizzy swirl eyes, wizard hat nowhere to be seen, one shoe flying off, completely disoriented" },
  // Joystick
  { name: "joystick", desc: "Standing in a wide power stance with wizard hat turned backwards on her head, both hands gripping an invisible steering wheel in front of her, intensely focused determined expression" },
  { name: "joystick-tilt", desc: "Same wide power stance but leaning hard to one side, one foot lifting off the ground, gritting teeth with effort, wizard hat backwards, intense gaming focus" },
  // BLE
  { name: "ble-on", desc: "Standing and tapping the brim of her wizard hat with one finger like casting a magical connection spell, a small lightning bolt zapping from the hat tip, confident expression" },
  { name: "ble-on-alt", desc: "Standing with a confident playful wink, wizard hat glowing at its tip with bright magical energy" },
  { name: "ble-off", desc: "Pulling her wizard hat down over her face with both hands, peeking out from under the brim with sleepy half-lidded eyes" },
  { name: "ble-off-alt", desc: "Standing with hands cupped gently around the wizard hat tip, snuffing out a small glow like carefully blowing out a candle" },
  { name: "ble-connected", desc: "Doing a little fist bump toward the viewer, wizard hat sparking brightly at the tip with energy, excited wide open-mouth smile" },
  // Debug
  { name: "debug", desc: "Peering through a large magnifying glass held up to one eye making that eye look comically huge through the lens, wizard hat pushed back on her head, serious inspector expression" },
  { name: "debug-alt", desc: "Holding a magnifying glass to the side, other hand thoughtfully scratching her chin, wizard hat pushed back, pondering expression" },
  // Idle poses
  { name: "idle-standing", desc: "Standing in a relaxed pose with hands clasped behind her back, gentle closed-mouth smile, wizard hat sitting neatly on her head" },
  { name: "idle-wand-twirl", desc: "Standing and holding a small wand, spinning it skillfully between her fingers like a pencil trick, watching it with amused entertained eyes, wizard hat tilted slightly" },
  { name: "idle-humming-1", desc: "Standing with eyes closed peacefully, swaying slightly to the left, mouth in a little O shape as if humming a happy tune, wizard hat tipping with the sway" },
  { name: "idle-humming-2", desc: "Standing with eyes closed peacefully, swaying slightly to the right, mouth in a little O shape as if humming a happy tune, wizard hat tipping with the sway" },
  { name: "idle-hat-adjust", desc: "Standing with both hands reaching up to carefully adjust her wizard hat, tongue poking out to one side in concentration" },
  { name: "idle-looking-left", desc: "Standing and leaning slightly to one side, peering off to the left with curious squinted eyes, wizard hat tilting with the lean" },
  { name: "idle-looking-right", desc: "Standing and leaning slightly to one side, peering off to the right with curious squinted eyes, wizard hat tilting with the lean" },
  { name: "idle-sitting", desc: "Sitting cross-legged on the ground, chin resting on both hands with elbows on her knees, dreamy far-off look, wizard hat on her head" },
  { name: "idle-glasses-push", desc: "Standing and pushing her round glasses up her nose with one finger, slight knowing smirk on her face, wizard hat neat on her head" },
  { name: "idle-spell-practice", desc: "Standing with both hands outstretched in front of her, fingers wiggling as if casting a tiny spell, small sparkle dots floating between her hands, concentrating expression, wizard hat on" },
  { name: "idle-yawn", desc: "Standing mid-yawn with one hand covering her mouth, wizard hat drooping lazily to one side, sleepy half-shut eyes" },
  { name: "idle-wave", desc: "Standing and looking directly at the viewer with a big warm friendly smile, one hand enthusiastically waving hello, wizard hat sitting neatly on her head" },
];

const BASE_PROMPT = `Generate a full-body character illustration of the SAME girl shown in the reference image. The reference shows 4 panels of the same character — match her appearance EXACTLY.

CRITICAL — CHARACTER MUST HAVE (match reference EXACTLY):
- Brown skin (EXACT same tone as reference — do NOT lighten or change her skin color)
- Locs/dreadlocks hairstyle (EXACT same style, length, and color as reference — this is very important)
- Round glasses (EXACT same as reference)
- Purple t-shirt (SAME as reference)
- Blue jeans

ADDITION: She wears a pointy purple wizard hat on top of her head.

STYLE: Same bold cartoon/comic art style as reference. Strong black outlines, flat colors, very expressive. She must look like the SAME character in every image.

FORMAT: Full body pose on a PURE WHITE background. NO shadows on the ground, NO scenery, NO other objects or characters. Character centered and filling most of the frame vertically. Must be simple, bold, and clear enough to read clearly at 135x180 pixels on a tiny LCD screen.

POSE: `;

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}
function hasFlag(name) { return process.argv.includes(`--${name}`); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Process AI-generated image: remove white background, make transparent,
 * resize to fit 3:4 canvas, pad to exact dimensions.
 *
 * Pipeline:
 * 1. Add 1px white border (ensures all background pixels connect)
 * 2. Flood-fill from 0,0 → transparent (fuzz for near-white)
 * 3. Remove border
 * 4. Trim excess transparent area
 * 5. Resize character to fit within 480x640 (maintains aspect ratio)
 * 6. Center on 540x720 transparent canvas (3:4 at 4x device resolution)
 */
function processImage(inputPath, outputPath) {
  try {
    execSync(
      `magick "${inputPath}" ` +
        `-bordercolor white -border 1 ` +
        `-alpha set ` +
        `-fuzz 20% -fill none -draw "color 0,0 floodfill" ` +
        `-shave 1x1 ` +
        `-trim +repage ` +
        `-resize 480x640\\> ` +
        `-gravity center -background none -extent 540x720 ` +
        `"${outputPath}"`,
      { stdio: "pipe" }
    );
    return true;
  } catch (e) {
    console.error(`  Processing failed: ${e.message}`);
    return false;
  }
}

async function generateSprite(ai, refBase64, sprite) {
  const prompt = BASE_PROMPT + sprite.desc;
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/png", data: refBase64 } },
          { text: prompt },
        ],
      },
    ],
    config: { responseModalities: ["TEXT", "IMAGE"] },
  });

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data;
  }
  return null;
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const processOnly = hasFlag("process-only");
  const startFrom = getArg("start-from");

  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY;
  if (!apiKey && !dryRun && !processOnly) {
    console.error("Missing GOOGLE_GENERATIVE_AI_API_KEY. Set in .env.local");
    process.exit(1);
  }

  if (!fs.existsSync(REFERENCE_IMAGE)) {
    console.error(`Reference image not found: ${REFERENCE_IMAGE}`);
    process.exit(1);
  }
  const refBase64 = fs.readFileSync(REFERENCE_IMAGE).toString("base64");

  let sprites = SPRITES;
  if (startFrom) {
    const idx = sprites.findIndex((s) => s.name === startFrom);
    if (idx === -1) {
      console.error(
        `Sprite "${startFrom}" not found. Available: ${sprites.map((s) => s.name).join(", ")}`
      );
      process.exit(1);
    }
    sprites = sprites.slice(idx);
    console.log(`Starting from "${startFrom}" (${sprites.length} remaining)\n`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Reference: ${REFERENCE_IMAGE}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Sprites: ${sprites.length}\n`);

  if (dryRun) {
    console.log("=== DRY RUN ===\n");
    for (const s of sprites) console.log(`  ${s.name}: ${s.desc}`);
    return;
  }

  if (processOnly) {
    console.log("=== PROCESS ONLY: re-processing existing images ===\n");
    const pngFiles = fs
      .readdirSync(OUTPUT_DIR)
      .filter((f) => f.endsWith(".png") && !f.endsWith("_raw.png"));
    for (const f of pngFiles) {
      const name = f.replace(".png", "");
      const rawPath = path.join(OUTPUT_DIR, `${name}_raw.png`);
      if (!fs.existsSync(rawPath))
        fs.copyFileSync(path.join(OUTPUT_DIR, f), rawPath);
      if (processImage(rawPath, path.join(OUTPUT_DIR, f)))
        console.log(`  OK: ${f}`);
      else console.log(`  FAIL: ${f}`);
    }
    const rawFiles = fs
      .readdirSync(OUTPUT_DIR)
      .filter((f) => f.endsWith("_raw.png"));
    for (const f of rawFiles) fs.unlinkSync(path.join(OUTPUT_DIR, f));
    console.log("\nDone.");
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  let success = 0,
    fail = 0;

  for (let i = 0; i < sprites.length; i++) {
    const sprite = sprites[i];
    const progress = `[${i + 1}/${sprites.length}]`;
    const rawPath = path.join(OUTPUT_DIR, `${sprite.name}_raw.png`);
    const finalPath = path.join(OUTPUT_DIR, `${sprite.name}.png`);

    console.log(`${progress} Generating: ${sprite.name}...`);

    try {
      const imageBase64 = await generateSprite(ai, refBase64, sprite);
      if (!imageBase64) {
        console.log(`${progress} FAIL - no image returned for ${sprite.name}`);
        fail++;
        continue;
      }

      fs.writeFileSync(rawPath, Buffer.from(imageBase64, "base64"));

      if (processImage(rawPath, finalPath)) {
        console.log(`${progress} OK: ${sprite.name}.png`);
        success++;
      } else {
        fs.copyFileSync(rawPath, finalPath);
        console.log(`${progress} OK (unprocessed): ${sprite.name}.png`);
        success++;
      }
    } catch (error) {
      console.error(`${progress} ERROR ${sprite.name}: ${error.message}`);
      fail++;
    }

    if (i < sprites.length - 1) await sleep(3000);
  }

  console.log(`\n=== Done ===`);
  console.log(`Success: ${success} | Failed: ${fail}`);
  console.log(`Output: ${OUTPUT_DIR}`);

  const rawFiles = fs
    .readdirSync(OUTPUT_DIR)
    .filter((f) => f.endsWith("_raw.png"));
  if (rawFiles.length > 0) {
    console.log(`\nCleaning up ${rawFiles.length} raw files...`);
    for (const f of rawFiles) fs.unlinkSync(path.join(OUTPUT_DIR, f));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
