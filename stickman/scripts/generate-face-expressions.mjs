/**
 * Generate face expression variations using Gemini image-to-image.
 *
 * Usage:
 *   node scripts/generate-face-expressions.mjs
 *   node scripts/generate-face-expressions.mjs --start-from wink
 *   node scripts/generate-face-expressions.mjs --dry-run
 *   node scripts/generate-face-expressions.mjs --process-only   # re-process existing raw files
 *
 * Requires: GOOGLE_GENERATIVE_AI_API_KEY in .env.local (or env)
 */

import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Load env from both stickman and kiosk-competency
config({ path: path.join(ROOT, ".env.local") });
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  config({ path: "/Users/mcohen/dev/kiosk-competency/.env.local" });
}

const FACES_DIR = path.join(ROOT, "public/images/sprite-faces");
const OUTPUT_DIR = path.join(FACES_DIR, "facegens");
const SOURCE_IMAGE = path.join(FACES_DIR, "default.png");
const MODEL = "gemini-3.1-flash-image-preview";

// Expression definitions: name + description for the prompt
const EXPRESSIONS = [
  { name: "happy", desc: "a big warm smile with eyes slightly squinted from genuine joy" },
  { name: "laughing", desc: "laughing hard with mouth wide open, eyes squeezed shut, pure delight" },
  { name: "excited", desc: "eyes wide and sparkling, huge open-mouth grin, eyebrows raised high with excitement" },
  { name: "surprised", desc: "mouth in a small O shape, eyebrows raised very high, eyes wide with surprise" },
  { name: "shocked", desc: "jaw dropped wide open, eyes huge and round, eyebrows shooting up in total shock" },
  { name: "wink", desc: "one eye closed in a playful wink, slight smirk on one side of the mouth" },
  { name: "thinking", desc: "eyes looking up and to the side, slight pout, one eyebrow raised as if pondering" },
  { name: "confused", desc: "furrowed brows, slight frown, head tilted slightly, bewildered expression" },
  { name: "determined", desc: "firm set jaw, focused narrowed eyes, slight confident frown, intense determination" },
  { name: "proud", desc: "chin slightly lifted, confident closed-mouth smile, eyes warm with pride" },
  { name: "nervous", desc: "teeth showing in an awkward grimace, eyes darting to the side, one eyebrow higher" },
  { name: "sleepy", desc: "heavy half-closed drooping eyelids, small yawn, drowsy relaxed expression" },
  { name: "annoyed", desc: "flat unamused mouth, half-lidded eyes, one eyebrow slightly raised in irritation" },
  { name: "sad", desc: "downturned mouth corners, slightly watery eyes, drooping eyebrows expressing sadness" },
  { name: "angry", desc: "deeply furrowed brows pushed together, tight frown, intense glaring eyes" },
  { name: "mischievous", desc: "sly half-smile on one side, narrowed cunning eyes, one eyebrow arched deviously" },
  { name: "embarrassed", desc: "tight awkward smile, eyes looking away, slight blush lines on cheeks" },
  { name: "skeptical", desc: "one eyebrow raised high, the other lowered, mouth pulled to one side doubtfully" },
  { name: "disgusted", desc: "nose scrunched up, upper lip curled, squinting eyes, repulsed expression" },
  { name: "singing", desc: "mouth open in an O shape as if singing a note, eyes closed peacefully, musical expression" },
  { name: "concentrating", desc: "tongue poking out slightly to one side, eyes focused and slightly narrowed, deep concentration" },
  { name: "smirk", desc: "one corner of the mouth pulled up in a knowing smirk, confident half-lidded eyes" },
  { name: "crying", desc: "eyes squeezed shut with tear drops, mouth open in a wail, deeply upset" },
  { name: "hopeful", desc: "eyes looking upward with a gentle optimistic smile, eyebrows slightly raised with hope" },
  { name: "cheeky", desc: "puffed out cheeks, playful squinting eyes, barely containing laughter" },
];

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Robust background removal for line art.
 * Works regardless of background color (white, green, any color).
 *
 * Strategy:
 * 1. Convert to grayscale
 * 2. Threshold to pure black/white (dark lines → black, everything else → white)
 * 3. Use -alpha shape: white pixels become opaque with black color, black (bg) becomes transparent
 *    Wait — we negate first so lines (black→white) become opaque and bg (white→black) becomes transparent
 * 4. Trim empty space
 */
function processImage(inputPath, outputPath) {
  try {
    execSync(
      `magick "${inputPath}" ` +
      `-colorspace Gray ` +
      `-threshold 45% ` +
      `-negate ` +
      `-background black ` +
      `-alpha shape ` +
      `-trim +repage ` +
      `"${outputPath}"`,
      { stdio: "pipe" }
    );
    return true;
  } catch (e) {
    console.error(`  Image processing failed: ${e.message}`);
    return false;
  }
}

async function generateExpression(ai, sourceBase64, expression) {
  const prompt = `Edit this black and white line art illustration to change ONLY the facial expression. Keep the EXACT same character - same girl, same glasses, same hairstyle (locs/dreadlocks pulled up), same line art style, same black and white ink drawing style, same head shape, same face proportions. Do NOT change the hair, glasses, ears, or overall head outline at all. ONLY modify the mouth, eyes, and eyebrows to show: ${expression.desc}. The result MUST be a clean black line drawing on a PURE WHITE background, identical art style to the original. NO colored backgrounds, NO shading, NO gray tones - only pure black lines on pure white.`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: sourceBase64,
            },
          },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  });

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return part.inlineData.data;
    }
  }
  return null;
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const processOnly = hasFlag("process-only");
  const startFrom = getArg("start-from");

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey && !dryRun && !processOnly) {
    console.error("Missing GOOGLE_GENERATIVE_AI_API_KEY. Set in .env.local");
    process.exit(1);
  }

  // Read source image
  if (!fs.existsSync(SOURCE_IMAGE)) {
    console.error(`Source image not found: ${SOURCE_IMAGE}`);
    process.exit(1);
  }
  const sourceBase64 = fs.readFileSync(SOURCE_IMAGE).toString("base64");

  // Filter expressions if start-from
  let expressions = EXPRESSIONS;
  if (startFrom) {
    const idx = expressions.findIndex((e) => e.name === startFrom);
    if (idx === -1) {
      console.error(`Expression "${startFrom}" not found. Available: ${expressions.map((e) => e.name).join(", ")}`);
      process.exit(1);
    }
    expressions = expressions.slice(idx);
    console.log(`Starting from "${startFrom}" (${expressions.length} remaining)\n`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Source: ${SOURCE_IMAGE}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Expressions: ${expressions.length}\n`);

  if (dryRun) {
    console.log("=== DRY RUN ===\n");
    for (const expr of expressions) {
      console.log(`  ${expr.name}: ${expr.desc}`);
    }
    return;
  }

  // --process-only: re-process existing raw files without regenerating
  if (processOnly) {
    console.log("=== PROCESS ONLY: re-processing existing images ===\n");
    // Process any existing final PNGs (they may have bad backgrounds)
    const pngFiles = fs.readdirSync(OUTPUT_DIR).filter(
      (f) => f.endsWith(".png") && !f.endsWith("_raw.png")
    );
    for (const f of pngFiles) {
      const name = f.replace(".png", "");
      const inputPath = path.join(OUTPUT_DIR, f);
      // Copy to _raw first as backup, then process
      const rawPath = path.join(OUTPUT_DIR, `${name}_raw.png`);
      if (!fs.existsSync(rawPath)) {
        fs.copyFileSync(inputPath, rawPath);
      }
      const finalPath = path.join(OUTPUT_DIR, f);
      if (processImage(rawPath, finalPath)) {
        console.log(`  OK: ${f}`);
      } else {
        console.log(`  FAIL: ${f}`);
      }
    }
    // Clean up raw files
    const rawFiles = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith("_raw.png"));
    for (const f of rawFiles) {
      fs.unlinkSync(path.join(OUTPUT_DIR, f));
    }
    console.log("\nDone.");
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  let success = 0;
  let fail = 0;

  for (let i = 0; i < expressions.length; i++) {
    const expr = expressions[i];
    const progress = `[${i + 1}/${expressions.length}]`;
    const rawPath = path.join(OUTPUT_DIR, `${expr.name}_raw.png`);
    const finalPath = path.join(OUTPUT_DIR, `${expr.name}.png`);

    console.log(`${progress} Generating: ${expr.name}...`);

    try {
      const imageBase64 = await generateExpression(ai, sourceBase64, expr);

      if (!imageBase64) {
        console.log(`${progress} FAIL - no image returned for ${expr.name}`);
        fail++;
        continue;
      }

      // Save raw version
      fs.writeFileSync(rawPath, Buffer.from(imageBase64, "base64"));

      // Process: remove background + trim
      if (processImage(rawPath, finalPath)) {
        console.log(`${progress} OK: ${expr.name}.png`);
        success++;
      } else {
        // fallback: just copy raw
        fs.copyFileSync(rawPath, finalPath);
        console.log(`${progress} OK (no processing): ${expr.name}.png`);
        success++;
      }
    } catch (error) {
      console.error(`${progress} ERROR ${expr.name}: ${error.message}`);
      fail++;
    }

    // Rate limit
    if (i < expressions.length - 1) {
      await sleep(3000);
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Success: ${success} | Failed: ${fail}`);
  console.log(`Output: ${OUTPUT_DIR}`);

  // Clean up raw files
  const rawFiles = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith("_raw.png"));
  if (rawFiles.length > 0) {
    console.log(`\nCleaning up ${rawFiles.length} raw files...`);
    for (const f of rawFiles) {
      fs.unlinkSync(path.join(OUTPUT_DIR, f));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
