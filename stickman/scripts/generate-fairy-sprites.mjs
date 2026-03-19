/**
 * Generate fairy Cece sprite frames for flight animation.
 * 4 poses on white → transparent for sprite cycling.
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

const OUTPUT_DIR = path.join(ROOT, "public/images/story/fairy");
const REFERENCE = path.join(ROOT, "public/images/reference-color.png");
const MODEL = "gemini-3.1-flash-image-preview";

const BASE = `STYLE: Bold cartoon/comic art style. Strong black outlines, flat vibrant colors, very cute and expressive.
BACKGROUND: Pure WHITE background. No scenery, no shadows.
DO NOT include any text or labels.
ONE single character only. TINY fairy-sized girl (about 3 inches tall).

THE CHARACTER (match reference EXACTLY):
- Brown skin (same tone as reference)
- Locs/dreadlocks hairstyle
- Round glasses
- Purple wizard hat (tiny, on her head)
- Purple t-shirt and blue jeans
- She has small translucent fairy/butterfly WINGS on her back that glow purple
- She is surrounded by a soft golden sparkle glow
- She looks magical, adorable, and full of energy
`;

const SPRITES = [
  {
    name: "fairy-fly-right",
    prompt: `${BASE}
POSE: Flying to the RIGHT. Body tilted forward at 30 degrees, arms stretched forward like Superman. Tiny fairy wings spread wide and glowing. Golden sparkle trail behind her. Happy excited face. She is zooming through the air to the right.`,
  },
  {
    name: "fairy-fly-up",
    prompt: `${BASE}
POSE: Flying UPWARD. Body vertical, arms raised above her head reaching for the sky. Fairy wings flapping wide. Golden sparkles cascading down below her. Joyful face looking up. She is soaring straight up.`,
  },
  {
    name: "fairy-dive",
    prompt: `${BASE}
POSE: Diving DOWNWARD playfully. Body tilted nose-down at 45 degrees, arms by her sides, fairy wings folded back like a diving bird. Golden sparkle trail above her. Mischievous grinning face. She is swooping down fast.`,
  },
  {
    name: "fairy-wave",
    prompt: `${BASE}
POSE: Floating in place, facing the viewer. One hand waving hello, other hand on hip. Fairy wings gently fluttering. Surrounded by golden sparkles and tiny hearts. Big warm smile, looking directly at the viewer. Cute and friendly.`,
  },
];

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function processToTransparent(inputPath, outputPath) {
  try {
    execSync(
      `magick "${inputPath}" -bordercolor white -border 1 -alpha set ` +
        `-fuzz 18% -fill none -draw "color 0,0 floodfill" -shave 1x1 ` +
        `-trim +repage -resize 300x300\\> "${outputPath}"`,
      { stdio: "pipe" }
    );
    return true;
  } catch (e) {
    console.error(`  Processing failed: ${e.message}`);
    return false;
  }
}

async function main() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) { console.error("Missing API key"); process.exit(1); }

  const refBase64 = fs.readFileSync(REFERENCE).toString("base64");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const ai = new GoogleGenAI({ apiKey });
  let success = 0;

  for (let i = 0; i < SPRITES.length; i++) {
    const sprite = SPRITES[i];
    console.log(`[${i + 1}/${SPRITES.length}] Generating: ${sprite.name}...`);
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/png", data: refBase64 } },
            { text: sprite.prompt },
          ],
        }],
        config: { responseModalities: ["TEXT", "IMAGE"] },
      });

      const parts = response?.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const rawPath = path.join(OUTPUT_DIR, `${sprite.name}-raw.png`);
          const outPath = path.join(OUTPUT_DIR, `${sprite.name}.png`);
          fs.writeFileSync(rawPath, Buffer.from(part.inlineData.data, "base64"));
          if (processToTransparent(rawPath, outPath)) {
            console.log(`  OK: ${sprite.name}.png (transparent, 300x300)`);
          } else {
            fs.copyFileSync(rawPath, outPath);
            console.log(`  OK: ${sprite.name}.png (unprocessed)`);
          }
          fs.unlinkSync(rawPath);
          success++;
          break;
        }
      }
    } catch (e) {
      console.error(`  ERROR: ${e.message}`);
    }
    if (i < SPRITES.length - 1) await sleep(3000);
  }

  console.log(`\nDone. ${success}/${SPRITES.length} sprites generated.`);
}

main().catch(err => { console.error(err); process.exit(1); });
