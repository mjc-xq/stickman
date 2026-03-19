/**
 * Generate animated video clips of Cece and friends using Google Veo.
 *
 * Usage:
 *   node scripts/generate-videos.mjs                    # generate all
 *   node scripts/generate-videos.mjs --start-from huey-lick  # resume from specific clip
 *   node scripts/generate-videos.mjs --dry-run          # preview prompts only
 *
 * Outputs:
 *   public/videos/raw/       — original MP4 from Veo
 *   public/videos/transparent/ — background-removed WebM with alpha
 *   public/videos/frames/    — individual transparent PNG frames
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

const REFERENCE_IMAGE = path.join(ROOT, "public/images/reference-color.png");
const HUEY_REFERENCE = path.join(ROOT, "public/images/huey-reference.jpg");
const ALEX_REFERENCE = path.join(ROOT, "public/images/Alex-Russo-alex-russo-16110429-427-640.webp");

const RAW_DIR = path.join(ROOT, "public/videos/raw");
const TRANSPARENT_DIR = path.join(ROOT, "public/videos/transparent");
const FRAMES_DIR = path.join(ROOT, "public/videos/frames");

const MODEL = "veo-3.1-generate-preview";

// Character description for consistency
const CECE_DESC = `a young Black girl with brown skin, locs/dreadlocks hairstyle, round glasses, purple t-shirt, blue jeans, and a pointy purple wizard hat. Bold cartoon/comic art style with strong black outlines and flat colors.`;

const HUEY_DESC = `a chunky tan/fawn bully breed dog with a big wrinkly face, cropped ears, stocky muscular build, and a pink tongue hanging out.`;

const ALEX_DESC = `a teen girl with long straight dark brown hair, olive skin, confident expression, wearing a colorful striped outfit and holding a red wand. Wizards of Waverly Place style.`;

const CLIPS = [
  {
    name: "cece-wand-wave",
    refs: ["cece"],
    prompt: `A cute cartoon girl (${CECE_DESC}) standing and waving a wooden magic wand in a figure-eight pattern. Golden sparkles and purple magical trails flow from the wand tip, swirling around her. She grins with excitement. Pure white background, no scenery. Cartoon animation style with bold outlines. 5 seconds.`,
  },
  {
    name: "huey-lick",
    refs: ["cece", "huey"],
    prompt: `A cute cartoon girl (${CECE_DESC}) sitting on the ground while a cartoon dog (${HUEY_DESC}) enthusiastically licks her entire face with its huge pink tongue. She laughs with her eyes squeezed shut, mouth wide open in giggly delight, glasses going askew. The dog's tail wags rapidly. Pure white background, no scenery. Bold cartoon animation style. 5 seconds.`,
  },
  {
    name: "cece-turns-alex-into-cat",
    refs: ["cece", "alex"],
    prompt: `A cute cartoon girl (${CECE_DESC}) points her wand at a teen wizard girl (${ALEX_DESC}). A bright purple magical blast shoots from the wand and hits the teen girl. The teen girl transforms with a puff of purple smoke into a surprised-looking cat wearing her striped outfit. The younger girl covers her mouth laughing. Pure white background, no scenery. Bold cartoon animation style. 8 seconds.`,
  },
  {
    name: "cece-spell-sparkles",
    refs: ["cece"],
    prompt: `A cute cartoon girl (${CECE_DESC}) holding her wand up high, concentrating intensely. Colorful magical energy — gold, purple, and pink sparkles — swirls up from the ground around her feet, spiraling up around her body and shooting out from the wand tip in a spectacular burst. Her wizard hat glows at the tip. Her locs float slightly from the magical energy. Pure white background, no scenery. Bold cartoon animation style. 6 seconds.`,
  },
  {
    name: "cece-spell-levitate",
    refs: ["cece"],
    prompt: `A cute cartoon girl (${CECE_DESC}) casting a levitation spell — she floats up off the ground with her arms spread wide, wizard hat lifting off her head slightly. Golden rings of magic circle around her as she rises. She looks down at the ground with amazed wide eyes and an open-mouth smile. Pure white background, no scenery. Bold cartoon animation style. 6 seconds.`,
  },
  {
    name: "fairy-cece-laugh",
    refs: ["cece"],
    prompt: `A tiny fairy version of a cute cartoon girl (${CECE_DESC}) — only 3 inches tall with delicate translucent wings on her back. She is laughing hysterically, holding her belly, stumbling and nearly falling over from laughing so hard. Her tiny wizard hat falls off. Sparkle dust falls from her wings as she shakes with laughter. Pure white background, no scenery. Bold cartoon animation style. 5 seconds.`,
  },
  {
    name: "fairy-cece-tumble",
    refs: ["cece"],
    prompt: `A tiny fairy version of a cute cartoon girl (${CECE_DESC}) — only 3 inches tall with delicate translucent wings on her back. She tumbles and somersaults through the air doing acrobatic flips, leaving trails of golden sparkle dust behind her. She spins, dives, loops, and giggles the whole time. Her wizard hat stays on magically. Pure white background, no scenery. Bold cartoon animation style. 6 seconds.`,
  },
  {
    name: "cece-huey-dance",
    refs: ["cece", "huey"],
    prompt: `A cute cartoon girl (${CECE_DESC}) and a cartoon dog (${HUEY_DESC}) doing a silly happy dance together. The girl bounces and waves her arms while the chunky dog spins in circles and hops clumsily. Both are having the time of their lives. Small music notes and sparkles float around them. Pure white background, no scenery. Bold cartoon animation style. 6 seconds.`,
  },
  {
    name: "cece-alex-high-five",
    refs: ["cece", "alex"],
    prompt: `A cute cartoon girl (${CECE_DESC}) and a teen wizard girl (${ALEX_DESC}) running toward each other and doing an epic jumping high five. When their hands meet, a massive burst of combined purple and gold magical energy explodes outward in a ring. Both freeze in mid-air for a moment with huge grins. Pure white background, no scenery. Bold cartoon animation style. 5 seconds.`,
  },
  {
    name: "cece-wand-point",
    refs: ["cece"],
    prompt: `A cute cartoon girl (${CECE_DESC}) dramatically pointing her wand directly at the camera/viewer. She has one eye narrowed with a mischievous confident grin. The wand tip crackles with purple and gold energy, building up to a magical blast. She winks. Pure white background, no scenery. Bold cartoon animation style. 5 seconds.`,
  },
];

function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}
function hasFlag(name) { return process.argv.includes(`--${name}`); }

function loadRef(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === ".webp" ? "image/webp" : ext === ".png" ? "image/png" : "image/jpeg";
  return {
    imageBytes: fs.readFileSync(filePath).toString("base64"),
    mimeType,
  };
}

/**
 * Remove white background from video frames using ImageMagick.
 * Same approach as the sprite pipeline — floodfill from corners.
 */
function removeBackgroundFromFrames(inputMp4, framesDir, clipName) {
  const clipFramesDir = path.join(framesDir, clipName);
  fs.mkdirSync(clipFramesDir, { recursive: true });

  // Extract frames as PNG
  console.log("    Extracting frames...");
  execSync(
    `ffmpeg -y -i "${inputMp4}" -vf "fps=24" "${clipFramesDir}/frame-%04d.png" 2>/dev/null`,
    { stdio: "pipe" }
  );

  // Remove white/near-white background from each frame
  // Floodfill from all 4 corners + edge midpoints to catch all background regions
  const frames = fs.readdirSync(clipFramesDir).filter(f => f.endsWith(".png")).sort();
  console.log(`    Processing ${frames.length} frames...`);
  for (const frame of frames) {
    const framePath = path.join(clipFramesDir, frame);
    try {
      // Get frame dimensions for edge midpoints
      const identify = execSync(`magick identify -format "%w %h" "${framePath}"`, { encoding: "utf-8" }).trim();
      const [w, h] = identify.split(" ").map(Number);
      const mx = Math.floor(w / 2);
      const my = Math.floor(h / 2);

      // Floodfill from 8 points: 4 corners + 4 edge midpoints
      // Higher fuzz (22%) to catch near-white and light gray artifacts
      execSync(
        `magick "${framePath}" ` +
        `-bordercolor white -border 1 ` +
        `-alpha set -fuzz 22% ` +
        `-fill none ` +
        `-draw "color 0,0 floodfill" ` +
        `-draw "color ${w},0 floodfill" ` +
        `-draw "color 0,${h} floodfill" ` +
        `-draw "color ${w},${h} floodfill" ` +
        `-draw "color ${mx},0 floodfill" ` +
        `-draw "color ${mx},${h} floodfill" ` +
        `-draw "color 0,${my} floodfill" ` +
        `-draw "color ${w},${my} floodfill" ` +
        `-shave 1x1 ` +
        `"${framePath}"`,
        { stdio: "pipe" }
      );
    } catch (e) {
      // Skip frames that fail
    }
  }

  return clipFramesDir;
}

/**
 * Reassemble transparent frames into WebM with alpha channel.
 */
function assembleTransparentVideo(clipFramesDir, outputWebm) {
  console.log("    Assembling transparent WebM...");
  try {
    execSync(
      `ffmpeg -y -framerate 24 -i "${clipFramesDir}/frame-%04d.png" ` +
      `-c:v libvpx-vp9 -pix_fmt yuva420p -b:v 2M -auto-alt-ref 0 ` +
      `"${outputWebm}" 2>/dev/null`,
      { stdio: "pipe" }
    );
    return true;
  } catch (e) {
    console.error(`    WebM assembly failed: ${e.message}`);
    return false;
  }
}

async function main() {
  const dryRun = hasFlag("dry-run");
  const processOnly = hasFlag("process-only");
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
  const refs = {
    cece: loadRef(REFERENCE_IMAGE),
    huey: loadRef(HUEY_REFERENCE),
    alex: loadRef(ALEX_REFERENCE),
  };

  let clips = CLIPS;
  if (startFrom) {
    const idx = clips.findIndex(c => c.name === startFrom);
    if (idx === -1) {
      console.error(`Clip "${startFrom}" not found. Available: ${clips.map(c => c.name).join(", ")}`);
      process.exit(1);
    }
    clips = clips.slice(idx);
    console.log(`Starting from "${startFrom}" (${clips.length} remaining)\n`);
  }

  // Create output directories
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(TRANSPARENT_DIR, { recursive: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  console.log(`Model: ${MODEL}`);
  console.log(`Clips: ${clips.length}`);
  console.log(`Output: ${RAW_DIR}\n`);

  if (dryRun) {
    console.log("=== DRY RUN ===\n");
    for (const c of clips) {
      console.log(`  ${c.name}:`);
      console.log(`    refs: ${c.refs.join(", ")}`);
      console.log(`    prompt: ${c.prompt.substring(0, 120)}...`);
      console.log();
    }
    return;
  }

  if (processOnly) {
    console.log("=== PROCESS ONLY: re-processing existing MP4s ===\n");
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const rawPath = path.join(RAW_DIR, `${clip.name}.mp4`);
      const transparentPath = path.join(TRANSPARENT_DIR, `${clip.name}.webm`);
      if (!fs.existsSync(rawPath)) {
        console.log(`[${i + 1}/${clips.length}] SKIP ${clip.name} — no raw MP4`);
        continue;
      }
      console.log(`[${i + 1}/${clips.length}] Processing: ${clip.name}...`);
      const clipFramesDir = removeBackgroundFromFrames(rawPath, FRAMES_DIR, clip.name);
      assembleTransparentVideo(clipFramesDir, transparentPath);
      console.log(`[${i + 1}/${clips.length}] Done: ${clip.name}.webm`);
    }
    console.log("\n=== Done ===");
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  let success = 0, failed = 0;

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const rawPath = path.join(RAW_DIR, `${clip.name}.mp4`);
    const transparentPath = path.join(TRANSPARENT_DIR, `${clip.name}.webm`);

    console.log(`[${i + 1}/${clips.length}] Generating: ${clip.name}...`);

    try {
      // Build reference images array
      const referenceImages = [];
      for (const refKey of clip.refs) {
        if (refs[refKey]) {
          referenceImages.push({
            image: {
              imageBytes: refs[refKey].imageBytes,
              mimeType: refs[refKey].mimeType,
            },
            referenceType: "STYLE",
          });
        }
      }

      // Generate video
      let operation = await ai.models.generateVideos({
        model: MODEL,
        prompt: clip.prompt,
        config: {
          aspectRatio: "9:16",  // portrait for story slides
          numberOfVideos: 1,
          durationSeconds: 8,
          ...(referenceImages.length > 0 ? { referenceImages } : {}),
        },
      });

      // Poll until done
      let pollCount = 0;
      while (!operation.done) {
        pollCount++;
        if (pollCount % 6 === 0) {
          console.log(`    Still generating... (${pollCount * 10}s)`);
        }
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await ai.operations.getVideosOperation({ operation });
      }

      // Download result
      const videos = operation.response?.generatedVideos;
      if (!videos || videos.length === 0) {
        console.log(`[${i + 1}/${clips.length}] FAIL - no video returned for ${clip.name}`);
        failed++;
        continue;
      }

      await ai.files.download({
        file: videos[0].video,
        downloadPath: rawPath,
      });
      console.log(`[${i + 1}/${clips.length}] OK: ${clip.name}.mp4`);

      // Process: remove background
      console.log(`  Processing ${clip.name}...`);
      const clipFramesDir = removeBackgroundFromFrames(rawPath, FRAMES_DIR, clip.name);
      assembleTransparentVideo(clipFramesDir, transparentPath);
      console.log(`  Done: ${clip.name}.webm`);

      success++;
    } catch (e) {
      console.log(`[${i + 1}/${clips.length}] ERROR ${clip.name}: ${e.message}`);
      failed++;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Success: ${success} | Failed: ${failed}`);
  console.log(`Raw MP4s: ${RAW_DIR}`);
  console.log(`Transparent WebMs: ${TRANSPARENT_DIR}`);
  console.log(`Individual frames: ${FRAMES_DIR}`);
}

main().catch(console.error);
