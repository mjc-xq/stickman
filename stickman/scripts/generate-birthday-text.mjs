/**
 * Generate birthday text image for particle animation.
 * Thick black text on white background — used as particle target like bt4-clean.png.
 *
 * Usage: node scripts/generate-birthday-text.mjs
 */

import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

config({ path: path.join(ROOT, ".env.local") });
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
  config({ path: "/Users/mcohen/dev/kiosk-competency/.env.local" });
}

const OUTPUT = path.join(ROOT, "public/images/story/birthday-text.png");
const MODEL = "gemini-3.1-flash-image-preview";

const PROMPT = `Generate an image with ONLY bold black text on a pure white background. Nothing else — no decorations, no borders, no illustrations, no shadows, no gradients. Just crisp, thick, heavy black text centered on white.

The text should say exactly:

Happy Birthday
CeCe!
You're a Star!

Requirements:
- Pure white (#FFFFFF) background, completely flat
- Bold black (#000000) text, very thick/heavy weight
- Clean sans-serif font (like Impact, Arial Black, or similar heavy weight)
- Text is large and fills most of the image
- Centered horizontally and vertically
- Three lines stacked
- "Happy Birthday" on line 1
- "CeCe!" on line 2 (largest, most prominent)
- "You're a Star!" on line 3
- NO decorations, stars, sparkles, borders, or any other elements
- This will be used as a silhouette for a particle animation, so clean edges are critical`;

async function main() {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  console.log("Generating birthday text image...");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: PROMPT }] }],
    config: { responseModalities: ["TEXT", "IMAGE"] },
  });

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      fs.writeFileSync(OUTPUT, Buffer.from(part.inlineData.data, "base64"));
      console.log(`OK: ${OUTPUT}`);
      return;
    }
  }

  console.error("No image returned");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
