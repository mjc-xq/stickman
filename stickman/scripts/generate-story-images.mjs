/**
 * Generate story illustration images for Cece's Birthday Story.
 *
 * Usage:
 *   node scripts/generate-story-images.mjs
 *   node scripts/generate-story-images.mjs --start-from 3
 *   node scripts/generate-story-images.mjs --dry-run
 *
 * Requires: GOOGLE_GENERATIVE_AI_API_KEY in .env.local
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

const OUTPUT_DIR = path.join(ROOT, "public/images/story");
const REFERENCE_IMAGE = path.join(ROOT, "public/images/reference-color.png");
const HUEY_REFERENCE = path.join(ROOT, "public/images/huey-reference.jpg");
const ALEX_REFERENCE = path.join(ROOT, "public/images/Alex-Russo-alex-russo-16110429-427-640.webp");
const MODEL = "gemini-3.1-flash-image-preview";

const BASE_STYLE = `STYLE: Whimsical children's storybook illustration. Rich, vibrant watercolor-like colors with magical glowing lighting. Warm enchanting atmosphere with a fantasy fairy-tale feel. Slightly painterly style with soft edges and dreamy glow effects. The scene should feel magical, like a page from a beautifully illustrated children's book.

BACKGROUND: Deep magical night sky with purple and blue tones, glowing stars and sparkles. NOT white background — every scene has a rich, detailed magical environment.

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
- Wearing a stylish outfit
`;

const CHARACTER_HUEY = `HUEY THE DOG (match reference photo EXACTLY):
- Chunky tan/fawn bully breed dog
- Wrinkly face, big head
- Cropped ears, stocky muscular build
- Pink tongue often hanging out
- Adorable and lovable
`;

const SCENES = [
  {
    name: "slide-01",
    refs: ["alex"],
    prompt: `${BASE_STYLE}${CHARACTER_ALEX}

SCENE: A magical wizard tower interior. Alex Russo stands in the center of a cozy, enchanted room filled with bubbling potions on shelves, floating spell books, glowing crystals, and candles casting warm light. Purple and gold magical energy swirls gently in the air. Alex has her hand on her famous wand, looking confident and mysterious. The room feels ancient and wonderful. Wide shot showing the full magical environment.`,
  },
  {
    name: "slide-02",
    refs: ["alex"],
    prompt: `${BASE_STYLE}${CHARACTER_ALEX}

SCENE: Alex Russo standing at a tall arched tower window, looking out at a breathtaking magical night sky. A brilliant shooting star streaks across the deep purple sky, leaving a trail of golden sparkles. Alex has a knowing, warm smile — she recognizes something special in that star. The window frame is ornate with magical runes. Stars and galaxies visible in the sky. Moonlight bathes the scene.`,
  },
  {
    name: "slide-03",
    refs: ["cece", "alex"],
    prompt: `${BASE_STYLE}${CHARACTER_CECE}${CHARACTER_ALEX}

SCENE: A magical moment — Alex Russo is kneeling down to Cece's height, offering her a glowing wand. The wand radiates brilliant purple and gold magical light between them. Cece looks up with wide, amazed eyes. Alex has a warm, encouraging smile. Magical sparkles and swirling energy flow between them. The setting is a magical garden at night with glowing flowers and fireflies.`,
  },
  {
    name: "slide-04",
    refs: ["cece"],
    prompt: `${BASE_STYLE}${CHARACTER_CECE}

IMPORTANT: Generate ONE SINGLE illustration — NOT multiple panels, NOT a comic strip, NOT a grid of images. ONE cohesive scene.

SCENE: A single beautiful scene showing Cece holding a glowing magical wand in front of her face. The wand tip blazes with brilliant purple-gold light. Floating within this magical glow, a TINY fairy-sized version of Cece (about 3 inches tall) dances and twirls joyfully, wearing the same wizard hat and outfit. Big Cece stares at her tiny self with pure wonder, mouth open in amazement. Sparkles, tiny stars, and magical musical notes swirl around them. Deep magical night sky background with stars. One single cohesive illustration.`,
  },
  {
    name: "slide-05",
    refs: ["cece", "alex"],
    prompt: `${BASE_STYLE}${CHARACTER_CECE}${CHARACTER_ALEX}

SCENE: Alex pointing at the tiny Cece who lives inside the glowing wand. The tiny Cece looks up adorably, surrounded by little hearts and sparkles. Big Cece holds the wand carefully, listening to Alex's instructions. Alex has one finger up in a "remember this!" teaching gesture. Little food icons (apple, leaf, cookie) float nearby as hints about feeding. Warm magical glow surrounds them.`,
  },
  {
    name: "slide-06",
    refs: ["cece"],
    prompt: `${BASE_STYLE}${CHARACTER_CECE}

SCENE: Cece standing in a living room, pointing the glowing wand at a TV screen. The TV screen ERUPTS with magical images — colorful dragons breathing sparkly fire, dolphins leaping through rainbow waves, unicorns galloping across clouds. The magical images seem to burst OUT of the TV into the room as 3D projections. Cece has an excited, thrilled expression. The room is lit by the magical glow from the TV.`,
  },
  {
    name: "slide-07",
    refs: ["cece"],
    prompt: `${BASE_STYLE}${CHARACTER_CECE}

SCENE: Cece standing on a grassy hilltop at night, pointing her glowing wand up at a spectacular night sky. The stars in the sky are rearranging themselves into the letters "CECE" made of brilliant golden star trails and constellations. Each letter sparkles and glows. Cece looks up in pure wonder and joy, bathed in golden starlight from above. Shooting stars accent the sky. The scene is breathtakingly magical.`,
  },
  {
    name: "slide-08",
    refs: ["cece", "huey"],
    prompt: `${BASE_STYLE}${CHARACTER_CECE}${CHARACTER_HUEY}

SCENE: A magical garden at night. Huey the chunky tan bully breed dog is leaping and bounding after a sparkly magical comet trail, tongue out, ears flapping, pure joy. The comet trail is made of golden and purple sparkles that loop and swirl through the air. Cece is behind him laughing hysterically, wand in hand, creating more sparkle trails for Huey to chase. Glowing flowers and fireflies surround them.`,
  },
  {
    name: "slide-09",
    refs: ["cece", "alex"],
    prompt: `${BASE_STYLE}${CHARACTER_CECE}${CHARACTER_ALEX}

SCENE: Alex and Cece doing an epic high-five in mid-air. A massive BURST of purple, gold, and white magical sparks EXPLODES from where their hands meet, like magical fireworks. Both are grinning ear to ear with pure joy. Alex's hair flows with the magical energy. Cece's wizard hat sparkles at the tip. The background is a swirl of magical auroras and stars. Celebratory, triumphant energy.`,
  },
  {
    name: "slide-10",
    refs: ["cece"],
    prompt: `${BASE_STYLE}${CHARACTER_CECE}

SCENE: Epic hero shot — Cece standing confidently on top of a magical hill, silhouetted against a spectacular aurora of purple, gold, and blue magical light. She holds her wand high above her head, and it shoots a brilliant beam of light into the sky that creates a shower of stars. Her wizard hat and locs blow in a magical wind. She looks powerful, confident, and magical. The most dramatic and beautiful image of the series — a true hero moment.`,
  },
];

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}
function hasFlag(name) { return process.argv.includes(`--${name}`); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function generateScene(ai, scene, refs) {
  const imageParts = [];

  if (scene.refs.includes("cece") && refs.cece) {
    imageParts.push({ inlineData: { mimeType: "image/png", data: refs.cece } });
  }
  if (scene.refs.includes("alex") && refs.alex) {
    const ext = "image/webp";
    imageParts.push({ inlineData: { mimeType: ext, data: refs.alex } });
  }
  if (scene.refs.includes("huey") && refs.huey) {
    imageParts.push({ inlineData: { mimeType: "image/jpeg", data: refs.huey } });
  }

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          ...imageParts.map(p => p),
          { text: scene.prompt },
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
  const startFrom = getArg("start-from");

  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY;
  if (!apiKey && !dryRun) {
    console.error("Missing GOOGLE_GENERATIVE_AI_API_KEY. Set in .env.local");
    process.exit(1);
  }

  // Load reference images
  const refs = {};
  if (fs.existsSync(REFERENCE_IMAGE)) {
    refs.cece = fs.readFileSync(REFERENCE_IMAGE).toString("base64");
    console.log("Loaded Cece reference");
  }
  if (fs.existsSync(ALEX_REFERENCE)) {
    refs.alex = fs.readFileSync(ALEX_REFERENCE).toString("base64");
    console.log("Loaded Alex reference");
  }
  if (fs.existsSync(HUEY_REFERENCE)) {
    refs.huey = fs.readFileSync(HUEY_REFERENCE).toString("base64");
    console.log("Loaded Huey reference");
  }

  let scenes = SCENES;
  if (startFrom) {
    const idx = parseInt(startFrom, 10) - 1;
    if (idx < 0 || idx >= scenes.length) {
      console.error(`Invalid start-from. Use 1-${scenes.length}`);
      process.exit(1);
    }
    scenes = scenes.slice(idx);
    console.log(`Starting from slide ${startFrom} (${scenes.length} remaining)\n`);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Scenes: ${scenes.length}\n`);

  if (dryRun) {
    console.log("=== DRY RUN ===\n");
    for (const s of scenes) console.log(`  ${s.name}: ${s.prompt.slice(0, 100)}...`);
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  let success = 0, fail = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const progress = `[${i + 1}/${scenes.length}]`;
    const outPath = path.join(OUTPUT_DIR, `${scene.name}.png`);

    console.log(`${progress} Generating: ${scene.name}...`);

    try {
      const imageBase64 = await generateScene(ai, scene, refs);
      if (!imageBase64) {
        console.log(`${progress} FAIL - no image returned for ${scene.name}`);
        fail++;
        continue;
      }

      fs.writeFileSync(outPath, Buffer.from(imageBase64, "base64"));
      console.log(`${progress} OK: ${scene.name}.png`);
      success++;
    } catch (error) {
      console.error(`${progress} ERROR ${scene.name}: ${error.message}`);
      fail++;
    }

    if (i < scenes.length - 1) await sleep(3000);
  }

  console.log(`\n=== Done ===`);
  console.log(`Success: ${success} | Failed: ${fail}`);
  console.log(`Output: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
