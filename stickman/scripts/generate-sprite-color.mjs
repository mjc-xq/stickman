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

// f = "face" (head/shoulders close-up, face fills frame)
// b = "body" (full body from head to feet)
const f = "face", b = "body";

const SPRITES = [
  // Boot / Wake
  { name: "wake-1", frame: f, desc: "Drowsy sleepy face, eyes barely open and half-lidded, head drooping slightly to one side, wizard hat askew and tilting" },
  { name: "wake-2", frame: f, desc: "Eyes popping wide open with excitement, one hand pushing glasses up her nose, wizard hat straightening, huge bright grin" },
  // Sleep
  { name: "sleep-1", frame: f, desc: "Big wide yawn with mouth open, eyes squeezed shut, wizard hat tilting back on her head" },
  { name: "sleep-2", frame: b, desc: "Curled up sitting with head resting on her knees, wizard hat pulled down over her eyes, a single letter Z floating above" },
  // Tap (bonked)
  { name: "tap-annoyed", frame: f, desc: "Flinching with one eye squinted shut in pain, one hand rubbing the top of her wizard hat where she was bonked, annoyed scrunched expression" },
  { name: "tap-angry", frame: f, desc: "Puffed out cheeks, deeply furrowed angry eyebrows, wizard hat knocked sideways on her head, fuming mad expression" },
  // Tilt / Orientation
  { name: "tilt-left", frame: f, desc: "Head and face tilting to the LEFT as if falling sideways, locs swinging to the left, startled wide worried eyes, wizard hat sliding off to the left, off-balance expression" },
  { name: "tilt-right", frame: f, desc: "Head and face tilting to the RIGHT as if falling sideways, locs swinging to the right, startled wide worried eyes, wizard hat sliding off to the right, off-balance expression" },
  { name: "tilt-up", frame: f, desc: "Face shown UPSIDE DOWN (rotated 180 degrees), glasses sliding off her nose downward, locs hanging upward due to gravity, wizard hat falling off, panicked frightened expression" },
  // Toss
  { name: "toss-launch", frame: b, desc: "Crouching low with knees deeply bent, wizard hat smashed down flat on her head by downward force, cheeks puffed, bracing for liftoff" },
  { name: "toss-air-1", frame: b, desc: "Floating in mid-air with arms and legs spread wide like a starfish, wizard hat drifting above her head, locs flowing upward, mouth in a perfect wide O of surprise" },
  { name: "toss-air-2", frame: b, desc: "Floating in mid-air with limbs pulled in tight, eyes squeezed shut, wizard hat drifting even further away, mouth open screaming with a mix of joy and terror" },
  { name: "catch-high", frame: f, desc: "Jaw dropped wide open in total amazement, eyes huge with awe, little stars and sparkles around her wizard hat tip, mind-blown expression" },
  { name: "catch-high-alt", frame: b, desc: "Landed dramatically in a superhero pose — one knee down, one fist on the ground, wizard hat trailing behind with motion lines" },
  { name: "catch-med", frame: f, desc: "Confident proud closed-eye smile, chin lifted slightly, wizard hat sitting perfectly straight, satisfied and pleased expression" },
  { name: "catch-med-alt", frame: b, desc: "Doing a happy little hop with one foot kicked back behind her, making a peace sign with one hand, wizard hat bouncing on her head" },
  { name: "catch-low", frame: f, desc: "Gentle relieved smile, one hand placed on her chest near her collarbone, wizard hat tilted slightly, grateful safe expression" },
  { name: "catch-low-alt", frame: f, desc: "Thumbs up held near her face, soft warm grin, wizard hat secure, reassuring expression" },
  { name: "toss-lost-1", frame: b, desc: "Tumbling and falling upside down in mid-air, wizard hat flying off completely, arms reaching out desperately, panicked wide frightened eyes" },
  { name: "toss-lost-2", frame: b, desc: "Tumbling further in mid-air with spiral dizzy swirl eyes, wizard hat nowhere to be seen, one shoe flying off, completely disoriented" },
  // Joystick
  { name: "joystick", frame: b, desc: "Wide power stance with wizard hat turned backwards on her head, both hands gripping an invisible steering wheel, intensely focused determined expression" },
  { name: "joystick-tilt", frame: b, desc: "Same wide power stance but leaning hard to one side, one foot lifting off the ground, gritting teeth with effort, wizard hat backwards" },
  // BLE
  { name: "ble-on", frame: f, desc: "Tapping the brim of her wizard hat with one finger, a small lightning bolt zapping from the hat tip, confident magical expression" },
  { name: "ble-on-alt", frame: f, desc: "Confident playful wink, wizard hat glowing brightly at its tip with magical sparkle energy" },
  { name: "ble-off", frame: f, desc: "Wizard hat pulled down over her face with both hands, peeking out from under the brim with sleepy half-lidded eyes" },
  { name: "ble-off-alt", frame: f, desc: "Hands cupped gently around the wizard hat tip, snuffing out a small glow like blowing out a candle, gentle expression" },
  { name: "ble-connected", frame: f, desc: "Excited wide open-mouth smile, wizard hat sparking brightly at the tip, fist bump gesture near her face" },
  // Debug
  { name: "debug", frame: f, desc: "Peering through a large magnifying glass held to one eye making that eye comically huge through the lens, wizard hat pushed back, serious inspector look" },
  { name: "debug-alt", frame: f, desc: "Magnifying glass held to the side, other hand scratching her chin thoughtfully, wizard hat pushed back, pondering curious expression" },
  // Idle poses (all close-ups — the expressions ARE the content)
  { name: "idle-standing", frame: f, desc: "Gentle soft closed-mouth smile, relaxed happy content expression, wizard hat sitting neatly" },
  { name: "idle-wand-twirl", frame: f, desc: "Eyes following something with amused entertained look, slight head tilt, wizard hat tilted playfully, watching a wand spin near her face" },
  { name: "idle-humming-1", frame: f, desc: "Eyes closed peacefully, head tilted slightly to the left, mouth in a little O shape as if humming a happy tune, wizard hat tipping with the tilt" },
  { name: "idle-humming-2", frame: f, desc: "Eyes closed peacefully, head tilted slightly to the right, mouth in a little O shape as if humming a happy tune, wizard hat tipping with the tilt" },
  { name: "idle-hat-adjust", frame: f, desc: "Both hands reaching up to adjust her wizard hat from below, tongue poking out to one side in concentration" },
  { name: "idle-looking-left", frame: f, desc: "Head turned, peering off to the left with curious squinted eyes, wizard hat tilting with the lean" },
  { name: "idle-looking-right", frame: f, desc: "Head turned, peering off to the right with curious squinted eyes, wizard hat tilting with the lean" },
  { name: "idle-sitting", frame: f, desc: "Chin resting on both hands, elbows visible at bottom, dreamy far-off daydreaming look, wizard hat on" },
  { name: "idle-glasses-push", frame: f, desc: "Pushing round glasses up her nose with one finger, slight knowing smirk, wizard hat neat" },
  { name: "idle-spell-practice", frame: f, desc: "Hands near her face with small sparkle dots floating between them, fingers wiggling, deeply concentrating expression, wizard hat on" },
  { name: "idle-yawn", frame: f, desc: "Mid-yawn with one hand covering her mouth, wizard hat drooping to one side, sleepy half-shut eyes" },
  { name: "idle-wave", frame: f, desc: "Big warm friendly smile looking directly at the viewer, one hand waving near her face, wizard hat sitting neatly" },
  // Tomagotchi — feed
  { name: "feed-1", frame: f, desc: "Cece holding a big green leaf in both hands, looking at it with wide excited eyes and an open-mouth smile, about to take a bite, wizard hat on" },
  { name: "feed-2", frame: f, desc: "Cece mid-bite, munching on a leaf with puffy cheeks, eyes squeezed shut with delight, small crumbs and leaf bits around mouth, wizard hat on" },
  // Tomagotchi — pet
  { name: "pet", frame: f, desc: "Cece with eyes gently closed, peaceful dreamy smile, head slightly tilted, looking deeply content and cozy as if being rocked gently, wizard hat on" },
  // Tomagotchi — sad
  { name: "sad-1", frame: f, desc: "Cece with big droopy sad eyes looking slightly up at the viewer, mouth in a small frown, eyebrows tilted up in the middle, lonely expression, wizard hat drooping" },
  { name: "sad-2", frame: f, desc: "Cece looking down and to the side, eyes half-closed, one hand on cheek, heavy sigh expression, slightly slouched posture, wizard hat on" },
];

const FRAMING = {
  face: "HEAD AND UPPER CHEST CLOSE-UP. Frame the character from roughly the shoulders up. Her face and wizard hat must fill most of the image — big and expressive. Do NOT show her full body, legs, or feet. ONE single character illustration, NOT multiple panels.",
  body: "FULL BODY illustration showing the complete character from head to feet. ONE single character illustration, NOT multiple panels or views.",
};

const BASE_PROMPT = `Generate an illustration of the SAME girl shown in the reference image. The reference shows 4 panels of the same character — match her appearance EXACTLY.

CRITICAL — CHARACTER MUST HAVE (match reference EXACTLY):
- Brown skin (EXACT same tone as reference — do NOT lighten or change her skin color)
- Locs/dreadlocks hairstyle (EXACT same style, length, and color as reference — this is very important)
- Round glasses (EXACT same as reference)
- Purple t-shirt (SAME as reference)
- Blue jeans

ADDITION: She wears a pointy purple wizard hat on top of her head.

STYLE: Same bold cartoon/comic art style as reference. Strong black outlines, flat colors, very expressive. She must look like the SAME character in every image.

FORMAT: On a PURE WHITE background. NO shadows, NO scenery, NO other objects. Must be simple, bold, and clear at 135x180 pixels on a tiny LCD screen.

`;

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
function processImage(inputPath, outputPath, frame) {
  // Close-ups: face fills more of the frame (less padding)
  // Full body: more breathing room around the character
  const innerSize = frame === "face" ? "510x680" : "460x613";
  try {
    execSync(
      `magick "${inputPath}" ` +
        `-bordercolor white -border 1 ` +
        `-alpha set ` +
        `-fuzz 20% -fill none -draw "color 0,0 floodfill" ` +
        `-shave 1x1 ` +
        `-trim +repage ` +
        `-resize ${innerSize}\\> ` +
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
  const prompt = BASE_PROMPT + FRAMING[sprite.frame] + "\n\nPOSE: " + sprite.desc;
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
      const spriteMatch = SPRITES.find((s) => s.name === name);
      const frame = spriteMatch?.frame ?? "body";
      const rawPath = path.join(OUTPUT_DIR, `${name}_raw.png`);
      if (!fs.existsSync(rawPath))
        fs.copyFileSync(path.join(OUTPUT_DIR, f), rawPath);
      if (processImage(rawPath, path.join(OUTPUT_DIR, f), frame))
        console.log(`  OK: ${f} (${frame})`);
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

      if (processImage(rawPath, finalPath, sprite.frame)) {
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
