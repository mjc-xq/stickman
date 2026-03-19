/**
 * Generate layered story images (background + foreground) for parallax slides.
 * Each slide gets two images:
 *   - slide-XX-bg.png  (scenic environment, no characters, wider)
 *   - slide-XX-fg.png  (characters on WHITE background, processed to transparent)
 *
 * Usage:
 *   node scripts/generate-story-layers.mjs
 *   node scripts/generate-story-layers.mjs --start-from 3
 *   node scripts/generate-story-layers.mjs --bg-only
 *   node scripts/generate-story-layers.mjs --fg-only
 *   node scripts/generate-story-layers.mjs --dry-run
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

const OUTPUT_DIR = path.join(ROOT, "public/images/story");
const REFERENCE_IMAGE = path.join(ROOT, "public/images/reference-color.png");
const HUEY_REFERENCE = path.join(ROOT, "public/images/huey-reference.jpg");
const ALEX_REFERENCE = path.join(ROOT, "public/images/Alex-Russo-alex-russo-16110429-427-640.webp");
const WAND_FRONT = path.join(ROOT, "public/images/wand-front.jpg");
const WAND_BACK = path.join(ROOT, "public/images/wand-back.jpg");
const MODEL = "gemini-3.1-flash-image-preview";

const WAND_DESC = `THE WAND (match the reference photos of the real wand EXACTLY):
- Black ornate body with dark gothic/organic sculptural texture
- Gold dragon with spread wings wrapped around the middle of the shaft
- Large pink/rose quartz crystal POINT on the top (the tip — faceted, hexagonal crystal shape)
- Small yellow rectangular screen (M5StickC device) embedded in the shaft, showing a tiny cartoon of Cece
- Round clear/frosted crystal ball at the very bottom (the base/pommel)
- Various gemstones embedded along the shaft: green jade, amber/brown stone, yellow-green stone
- Overall: a dark, ornate, magical wand with precious stones, a dragon, and crystals — NOT a simple wooden stick
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
`;

const BG_STYLE = `STYLE: Rich, painterly fantasy environment illustration. Vibrant watercolor-like colors with magical glowing lighting. Deep depth and atmosphere — this should feel like a real magical place. Wide aspect ratio for parallax scrolling.
DO NOT include any characters, people, or animals. Environment ONLY.
DO NOT include any text, words, or labels.
`;

const FG_STYLE = `STYLE: Bold cartoon/comic art style matching the Cece reference. Strong black outlines, flat vibrant colors, very expressive characters.
BACKGROUND: Pure WHITE background. No scenery, no ground, no shadows on the ground. Characters float on white.
DO NOT include any text, words, or labels.
IMPORTANT: ONE single illustration, NOT multiple panels or comic strips.
`;

const SCENES = [
  {
    name: "slide-01",
    fgRefs: ["alex", "wand"],
    bgRefs: [],
    bg: `${BG_STYLE}\nSCENE: Interior of a magical wizard tower. Bubbling potions on wooden shelves, floating spell books with glowing runes, crystals of various colors catching candlelight, an arched stone window showing a starry night sky. Purple and gold magical energy wisps drift through the air. Ancient, cozy, wonderfully magical.`,
    fg: `${FG_STYLE}${CHARACTER_ALEX}${WAND_DESC}\nSCENE: Alex Russo standing confidently, one hand resting on the ornate black wand (matching the wand reference photos). She looks mysterious and knowing. Full body pose on pure white background.`,
  },
  {
    name: "slide-02",
    fgRefs: ["alex"],
    bgRefs: [],
    bg: `${BG_STYLE}\nSCENE: View through an ornate arched tower window at a breathtaking magical night sky. A brilliant shooting star with a golden trail streaks across deep purple clouds. Galaxies and nebulae visible. Moonlight pours through. Magical runes carved into the stone window frame glow faintly.`,
    fg: `${FG_STYLE}${CHARACTER_ALEX}\nSCENE: Alex Russo in profile, looking upward with a warm knowing smile, one hand touching the window frame. She sees something special in the sky. Upper body on pure white background.`,
  },
  {
    name: "slide-03",
    fgRefs: ["cece", "alex", "wand"],
    bgRefs: [],
    bg: `${BG_STYLE}\nSCENE: A magical garden at night with bioluminescent flowers (purple, blue, pink) glowing softly. Fireflies and sparkle motes drift through the air. Ancient trees with twisting branches frame the scene. Stars visible above. Warm magical glow emanating from the center. Enchanted, dreamy atmosphere.`,
    fg: `${FG_STYLE}${CHARACTER_CECE}${CHARACTER_ALEX}${WAND_DESC}\nSCENE: Alex kneeling down to Cece's height, offering the ornate black wand (matching reference photos — with pink crystal tip, gold dragon, yellow screen, crystal ball base). The wand radiates purple-gold light. Cece looks up with wide amazed eyes. Sparkles flow between them. On pure white background.`,
  },
  {
    name: "slide-04",
    fgRefs: ["cece", "wand"],
    bgRefs: [],
    bg: `${BG_STYLE}\nSCENE: Close-up magical energy burst — swirling purple and gold light filling the frame. Musical notes made of light float. Sparkles and tiny stars cascade. A warm magical glow dominates the center. Abstract magical energy environment.`,
    fg: `${FG_STYLE}${CHARACTER_CECE}${WAND_DESC}\nSCENE: Close-up of Cece holding the ornate wand, staring in amazement. The wand's pink crystal tip blazes with light. A TINY fairy-sized version of Cece (3 inches tall, same outfit and wizard hat) dances joyfully in the glow above the wand. Musical notes and sparkles surround them. Cece's mouth is open in wonder. On pure white background. ONE single scene.`,
  },
  {
    name: "slide-05",
    fgRefs: ["cece", "alex", "wand"],
    bgRefs: [],
    bg: `${BG_STYLE}\nSCENE: Warm magical glow with translucent golden silhouettes of a loving family floating like ethereal memories. Hearts and golden light particles drift. The atmosphere is warm, loving, protective. Stars and gentle magical energy.`,
    fg: `${FG_STYLE}${CHARACTER_CECE}${CHARACTER_ALEX}${WAND_DESC}\nSCENE: Alex with arm around Cece's shoulders protectively. Cece holds the ornate wand between them (matching reference — black body, gold dragon, pink crystal tip, yellow screen showing tiny Cece, crystal ball base). Inside the wand's glow, the tiny Cece is visible with hearts around her. A small apple and leaf float nearby. Alex gestures at the wand explaining something important. On pure white background. ONE single scene.`,
  },
  {
    name: "slide-06",
    fgRefs: ["cece", "wand"],
    bgRefs: [],
    bg: `${BG_STYLE}\nSCENE: A living room at night transformed by magic — the TV screen ERUPTS with magical creatures. Colorful dragons breathing sparkly fire, dolphins leaping through rainbow waves, unicorns galloping across clouds — all bursting OUT of the TV as luminous 3D projections filling the room. Magical light bathes everything.`,
    fg: `${FG_STYLE}${CHARACTER_CECE}${WAND_DESC}\nSCENE: Cece pointing the ornate wand forward with an excited thrilled expression, mouth open in delight. The wand's pink crystal tip glows intensely. She's mid-flick, dynamic pose. On pure white background.`,
  },
  {
    name: "slide-07",
    fgRefs: ["cece", "wand"],
    bgRefs: [],
    bg: `${BG_STYLE}\nSCENE: Spectacular night sky with stars rearranging into the letters "CECE" made of brilliant golden star trails and constellations. Each letter sparkles and pulses with golden light. Shooting stars accent the scene. A grassy hilltop silhouette at the bottom edge. Breathtakingly magical sky.`,
    fg: `${FG_STYLE}${CHARACTER_CECE}${WAND_DESC}\nSCENE: Cece from behind/side angle, pointing the ornate wand upward at the sky with wonder and joy, her face lit by golden starlight from above. Wizard hat silhouetted. On pure white background.`,
  },
  {
    name: "slide-08",
    fgRefs: ["cece", "huey", "wand"],
    bgRefs: [],
    bg: `${BG_STYLE}\nSCENE: A magical garden at night. Golden and purple sparkle comet trails loop and zigzag through the air. Bioluminescent flowers glow. Fireflies everywhere. The sparkle trails create swirling patterns across the scene. Enchanted nighttime garden.`,
    fg: `${FG_STYLE}${CHARACTER_CECE}${CHARACTER_HUEY}${WAND_DESC}\nSCENE: Cece laughing hysterically, wand in hand creating sparkle trails. Huey the chunky tan bully breed dog is mid-leap, tongue out, ears flapping, chasing a sparkly comet trail. Pure joy. Dynamic action pose. On pure white background. DO NOT include any text.`,
  },
  {
    name: "slide-09",
    fgRefs: ["cece", "alex"],
    bgRefs: [],
    bg: `${BG_STYLE}\nSCENE: Explosive burst of purple, gold, and white magical sparks and fireworks against a deep night sky. Magical auroras swirl. Stars shimmer. Celebratory, triumphant magical energy filling the sky. Like the finale of a fireworks show but with magical sparkles.`,
    fg: `${FG_STYLE}${CHARACTER_CECE}${CHARACTER_ALEX}\nSCENE: Alex and Cece doing an epic high-five. A massive BURST of magical sparks explodes from where their hands meet. Both grinning ear to ear, slightly jumping. Alex's hair flows with energy. Cece's wizard hat sparkles. On pure white background.`,
  },
  {
    name: "slide-10",
    fgRefs: ["cece", "wand"],
    bgRefs: [],
    bg: `${BG_STYLE}\nSCENE: Epic vista — a hilltop silhouette against a spectacular aurora of purple, gold, and blue magical light filling the entire sky. A brilliant beam of light shoots upward creating a shower of stars. The most dramatic and beautiful magical sky. Heroic, powerful atmosphere.`,
    fg: `${FG_STYLE}${CHARACTER_CECE}${WAND_DESC}\nSCENE: Epic hero pose — Cece standing confidently, holding the ornate wand high above her head. The pink crystal tip blazes with light. Her wizard hat and locs blow in magical wind. She looks powerful, confident, and magical. Full body on pure white background.`,
  },
];

function hasFlag(name) { return process.argv.includes(`--${name}`); }
function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}
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
    contents: [{
      role: "user",
      parts: [...imageParts, { text: prompt }],
    }],
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
  const bgOnly = hasFlag("bg-only");
  const fgOnly = hasFlag("fg-only");
  const startFrom = getArg("start-from");

  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY;
  if (!apiKey && !dryRun) {
    console.error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
    process.exit(1);
  }

  // Load all reference images
  const refImages = {};
  const loadRef = (key, filePath, mime) => {
    if (fs.existsSync(filePath)) {
      refImages[key] = { base64: fs.readFileSync(filePath).toString("base64"), mime };
      console.log(`  Loaded: ${key}`);
    }
  };
  loadRef("cece", REFERENCE_IMAGE, "image/png");
  loadRef("alex", ALEX_REFERENCE, "image/webp");
  loadRef("huey", HUEY_REFERENCE, "image/jpeg");
  loadRef("wand", WAND_FRONT, "image/jpeg");
  loadRef("wand2", WAND_BACK, "image/jpeg");

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
  console.log(`Scenes: ${scenes.length} × ${bgOnly ? "bg" : fgOnly ? "fg" : "bg+fg"}\n`);

  if (dryRun) {
    for (const s of scenes) {
      console.log(`  ${s.name}: bg=${s.bg.slice(0, 60)}...`);
      console.log(`  ${s.name}: fg=${s.fg.slice(0, 60)}...`);
    }
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  let success = 0, fail = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const progress = `[${i + 1}/${scenes.length}]`;

    // Generate background
    if (!fgOnly) {
      const bgPath = path.join(OUTPUT_DIR, `${scene.name}-bg.png`);
      console.log(`${progress} Generating: ${scene.name}-bg...`);
      try {
        const data = await generate(ai, scene.bg, scene.bgRefs, refImages);
        if (data) {
          fs.writeFileSync(bgPath, Buffer.from(data, "base64"));
          console.log(`${progress} OK: ${scene.name}-bg.png`);
          success++;
        } else {
          console.log(`${progress} FAIL: no image for ${scene.name}-bg`);
          fail++;
        }
      } catch (e) {
        console.error(`${progress} ERROR ${scene.name}-bg: ${e.message}`);
        fail++;
      }
      await sleep(2000);
    }

    // Generate foreground
    if (!bgOnly) {
      const fgRawPath = path.join(OUTPUT_DIR, `${scene.name}-fg-raw.png`);
      const fgPath = path.join(OUTPUT_DIR, `${scene.name}-fg.png`);
      console.log(`${progress} Generating: ${scene.name}-fg...`);
      try {
        // Include wand reference photos for fg scenes that need it
        const refs = [...scene.fgRefs];
        if (refs.includes("wand") && refImages.wand2) {
          refs.push("wand2"); // include both wand angles
        }
        const data = await generate(ai, scene.fg, refs, refImages);
        if (data) {
          fs.writeFileSync(fgRawPath, Buffer.from(data, "base64"));
          // Process to transparent background
          if (processToTransparent(fgRawPath, fgPath)) {
            console.log(`${progress} OK: ${scene.name}-fg.png (transparent)`);
          } else {
            fs.copyFileSync(fgRawPath, fgPath);
            console.log(`${progress} OK: ${scene.name}-fg.png (unprocessed)`);
          }
          success++;
        } else {
          console.log(`${progress} FAIL: no image for ${scene.name}-fg`);
          fail++;
        }
      } catch (e) {
        console.error(`${progress} ERROR ${scene.name}-fg: ${e.message}`);
        fail++;
      }
      await sleep(2000);
    }
  }

  // Clean up raw files
  const rawFiles = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith("-fg-raw.png"));
  if (rawFiles.length > 0) {
    console.log(`\nCleaning up ${rawFiles.length} raw files...`);
    for (const f of rawFiles) fs.unlinkSync(path.join(OUTPUT_DIR, f));
  }

  console.log(`\n=== Done ===`);
  console.log(`Success: ${success} | Failed: ${fail}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
