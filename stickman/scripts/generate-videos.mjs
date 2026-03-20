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

const ALEX_DESC = `a teen girl with long straight dark brown hair, olive skin, confident expression, wearing a colorful striped outfit and holding a red wand.`;

// CRITICAL framing instruction appended to every prompt
const FRAMING = `CRITICAL FRAMING RULES: All characters must be FULLY visible in frame at ALL times — no cropping, no characters partially off-screen, no limbs or heads cut off at any edge. Keep characters centered with comfortable padding on all sides. The camera must NOT pan, zoom, or move in a way that cuts off any character. Characters can be smaller in the frame if needed to ensure they stay fully visible. Pure white background, absolutely no scenery, no ground plane, no shadows on ground. Bold cartoon animation style with strong black outlines.`;

const CLIPS = [
  {
    name: "cece-wand-wave",
    refs: ["cece"],
    prompt: `Full body shot of a cute cartoon girl (${CECE_DESC}) standing center frame, waving a wooden magic wand in a flowing figure-eight pattern. Golden sparkles and purple magical trails flow from the wand tip, swirling elegantly around her. She beams with pure excitement, bouncing slightly on her toes. The sparkles leave lingering trails that fade beautifully. ${FRAMING}`,
  },
  {
    name: "huey-lick",
    refs: ["cece", "huey"],
    prompt: `Full body shot of a cute cartoon girl (${CECE_DESC}) sitting cross-legged center frame while a cartoon dog (${HUEY_DESC}) enthusiastically licks her entire face with its huge pink tongue. She throws her head back laughing with eyes squeezed shut, mouth wide open in pure giggly delight, glasses going completely askew from the slobber. The dog's tail wags so fast it's a blur. Both characters fully visible. ${FRAMING}`,
  },
  {
    name: "cece-turns-alex-into-cat",
    refs: ["cece", "alex"],
    prompt: `Wide shot of two characters fully visible center frame: a cute cartoon girl (${CECE_DESC}) on the left points her wand at a teen wizard girl (${ALEX_DESC}) on the right. A bright purple magical blast shoots from the wand. The teen girl is engulfed in swirling purple and gold smoke, and when the smoke clears she has transformed into a surprised fluffy cat still wearing the striped outfit. The younger girl doubles over covering her mouth, laughing uncontrollably. ${FRAMING}`,
  },
  {
    name: "cece-spell-sparkles",
    refs: ["cece"],
    prompt: `Full body shot of a cute cartoon girl (${CECE_DESC}) standing center frame, holding her wand up high with both hands, eyes closed in deep concentration. Colorful magical energy — brilliant gold, deep purple, and hot pink sparkles — swirls up from below her feet in spiraling ribbons, wrapping around her body and exploding from the wand tip in a spectacular starburst. Her wizard hat glows intensely at the tip. Her locs lift and float from the magical energy. The whole scene radiates power and wonder. ${FRAMING}`,
  },
  {
    name: "cece-spell-levitate",
    refs: ["cece"],
    prompt: `Full body shot of a cute cartoon girl (${CECE_DESC}) center frame, casting a levitation spell on herself. She gently floats upward off the ground with arms spread wide like wings, wizard hat lifting slightly off her head. Concentric golden rings of magic pulse outward from her body as she rises. She looks down with amazed wide eyes and a joyful open-mouth gasp. Sparkle dust drifts downward from her shoes. Leave room above her head for the float. ${FRAMING}`,
  },
  {
    name: "fairy-cece-laugh",
    refs: ["cece"],
    prompt: `Center frame: a tiny fairy version of a cute cartoon girl (${CECE_DESC}) — miniature with delicate translucent iridescent wings on her back. She is laughing so hard she can barely stand, holding her belly with both hands, knees buckling, stumbling sideways. Her tiny wizard hat tumbles off her head. Golden sparkle dust puffs from her fluttering wings with each heave of laughter. She's absolutely losing it — the most contagious laugh ever. Fairy is centered with plenty of space around her. ${FRAMING}`,
  },
  {
    name: "fairy-cece-tumble",
    refs: ["cece"],
    prompt: `Center frame: a tiny fairy version of a cute cartoon girl (${CECE_DESC}) — miniature with delicate translucent iridescent wings on her back. She performs graceful acrobatic tumbles and somersaults through the air — spinning, looping, diving, and twirling. Golden sparkle dust trails behind her every movement, creating beautiful swirling patterns. Her wizard hat stays on magically. She giggles the whole time, clearly having the time of her life. All movement stays well within the frame. ${FRAMING}`,
  },
  {
    name: "cece-huey-dance",
    refs: ["cece", "huey"],
    prompt: `Wide shot of a cute cartoon girl (${CECE_DESC}) and a cartoon dog (${HUEY_DESC}) doing an adorably silly happy dance together, both fully visible center frame. The girl bounces from foot to foot waving her arms overhead while the chunky dog attempts to copy her — spinning in clumsy circles, hopping on his stubby legs, tongue flapping. Musical notes and colorful sparkles float around them. Both having the absolute time of their lives. Pure joy and silliness. ${FRAMING}`,
  },
  {
    name: "cece-alex-high-five",
    refs: ["cece", "alex"],
    prompt: `Wide shot with both characters fully visible: a cute cartoon girl (${CECE_DESC}) on the left and a teen wizard girl (${ALEX_DESC}) on the right run toward each other from opposite sides. They leap into the air and meet in the center for an epic mid-air high five. The moment their hands connect, a massive shockwave of combined purple and gold magical energy bursts outward in expanding rings. Both hang in the air for a beat with enormous triumphant grins before landing. ${FRAMING}`,
  },
  {
    name: "cece-wand-point",
    refs: ["cece"],
    prompt: `Upper body shot of a cute cartoon girl (${CECE_DESC}) center frame, dramatically thrusting her wand forward directly toward the viewer. One eye narrowed, the other wide, with a mischievous confident smirk. The wand tip crackles and builds with purple and gold electrical energy, sparks arcing and growing more intense. She gives a playful wink. The energy reaches a crescendo and fires a sparkle blast. Character stays fully in frame throughout. ${FRAMING}`,
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
