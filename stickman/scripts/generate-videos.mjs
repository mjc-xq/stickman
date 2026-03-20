/**
 * Generate animated video clips of Cece and friends using a two-step pipeline:
 *   1. Gemini image generation → creates a starting frame in Cece's art style
 *   2. Veo image-to-video → animates that frame
 *   3. Background removal → transparent WebM
 *
 * Usage:
 *   node scripts/generate-videos.mjs                         # generate all
 *   node scripts/generate-videos.mjs --start-from huey-lick  # resume
 *   node scripts/generate-videos.mjs --process-only          # re-process existing MP4s
 *   node scripts/generate-videos.mjs --dry-run               # preview prompts
 *
 * Outputs (in public/videos/):
 *   raw/          — original MP4 from Veo (gitignored)
 *   startframes/  — generated starting frame PNGs (gitignored)
 *   transparent/  — final background-removed WebM with alpha
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
const STARTFRAME_DIR = path.join(ROOT, "public/videos/startframes");
const TRANSPARENT_DIR = path.join(ROOT, "public/videos/animated");
const TEMP_FRAMES_DIR = path.join(ROOT, "public/videos/.frames"); // temp, cleaned up

const IMAGE_MODEL = "gemini-3.1-flash-image-preview";
const VIDEO_MODEL = "veo-3.1-generate-preview";

// ── Prompts ──────────────────────────────────────────────────────────

// Base prompt for image generation — same as sprite pipeline for consistency
const IMAGE_BASE_PROMPT = `Generate an illustration of the SAME girl shown in the reference image. The reference shows 4 panels of the same character — match her appearance EXACTLY.

CRITICAL — CHARACTER MUST HAVE (match reference EXACTLY):
- Brown skin (EXACT same tone as reference — do NOT lighten or change her skin color)
- Locs/dreadlocks hairstyle (EXACT same style, length, and color as reference — this is very important)
- Round glasses (EXACT same as reference)
- Purple t-shirt (SAME as reference)
- Blue jeans

ADDITION: She wears a pointy purple wizard hat on top of her head.

STYLE: Same bold cartoon/comic art style as reference. Strong black outlines, flat colors, very expressive. She must look like the SAME character in every image.

`;

const HUEY_IN_STYLE = `In the SAME bold cartoon art style as the girl: a chunky tan/fawn bully breed dog matching the dog reference photo — same wrinkly face, fawn coat, cropped ears, stocky muscular build, big pink tongue. Draw the dog in cartoon style with strong black outlines and flat colors to match the girl's art style.`;

const ALEX_IN_STYLE = `In the SAME bold cartoon art style as the girl: a teen wizard girl matching the Alex reference photo — long straight dark brown hair, olive skin, confident smirk, colorful striped outfit, red wand. Draw her in cartoon style with strong black outlines and flat colors to match the girl's art style.`;

const CLIPS = [
  {
    name: "cece-wand-wave",
    aspect: "9:16",
    refs: ["cece"],
    imagePrompt: `FULL BODY illustration on PURE WHITE background. The girl standing center frame holding a wooden magic wand up, tip glowing with golden sparkles. Big excited grin, wizard hat on. Plenty of white space around her — do NOT crop any part of her body. No shadows, no scenery.`,
    videoPrompt: `The cartoon girl waves her magic wand in a flowing figure-eight pattern. Golden sparkles and purple magical trails swirl from the wand tip around her. She bounces on her toes with excitement. Smooth cartoon animation. White background.`,
  },
  {
    name: "huey-lick",
    aspect: "9:16",
    refs: ["cece", "huey"],
    imagePrompt: `FULL BODY illustration on PURE WHITE background. The girl sitting cross-legged center frame, with a chunky cartoon dog next to her. ${HUEY_IN_STYLE} The dog is leaning toward the girl's face. Both fully visible with space around them. No shadows, no scenery.`,
    videoPrompt: `The cartoon dog enthusiastically licks the girl's entire face with its huge pink tongue. She throws her head back laughing, eyes squeezed shut, glasses going askew. The dog's tail wags rapidly. Cartoon animation. White background.`,
  },
  {
    name: "cece-turns-alex-cat",
    aspect: "9:16",
    refs: ["cece", "alex"],
    imagePrompt: `FULL BODY illustration on PURE WHITE background. Wide shot showing TWO characters fully visible: the girl on the left pointing her wand at a teen wizard girl on the right. ${ALEX_IN_STYLE} Both standing facing each other, plenty of space around both. Purple magical energy crackling at the wand tip. No shadows, no scenery.`,
    videoPrompt: `A bright purple magical blast shoots from the younger girl's wand and hits the teen girl. The teen girl is engulfed in swirling purple smoke and transforms into a surprised fluffy cat wearing a striped outfit. The younger girl covers her mouth laughing. Cartoon animation. White background.`,
  },
  {
    name: "cece-spell-sparkles",
    aspect: "9:16",
    refs: ["cece"],
    imagePrompt: `FULL BODY illustration on PURE WHITE background. The girl standing center frame, holding her wand up high with both hands, eyes closed in concentration. Colorful sparkles — gold, purple, pink — beginning to swirl at the wand tip. Wizard hat glowing. Fully visible with space around her. No shadows, no scenery.`,
    videoPrompt: `Magical energy erupts — brilliant gold, deep purple, and hot pink sparkles spiral up from below her feet, wrapping around her body and exploding from the wand tip in a spectacular starburst. Her locs float from the energy. Cartoon animation. White background.`,
  },
  {
    name: "cece-levitate",
    aspect: "9:16",
    refs: ["cece"],
    imagePrompt: `FULL BODY illustration on PURE WHITE background. The girl standing center frame with arms starting to spread wide, wand in one hand, looking up. Faint golden rings appearing at her feet. Leave LOTS of space above her head. Fully visible. No shadows, no scenery.`,
    videoPrompt: `The girl gently floats upward off the ground with arms spread wide. Golden rings of magic pulse outward from her body. Her wizard hat lifts slightly off her head. She looks down with amazed wide eyes and a joyful gasp. Sparkle dust drifts from her shoes. Smooth cartoon animation. White background.`,
  },
  {
    name: "fairy-cece-laugh",
    aspect: "9:16",
    refs: ["cece"],
    imagePrompt: `FULL BODY illustration on PURE WHITE background. A TINY fairy version of the girl — miniature with delicate translucent iridescent butterfly wings on her back. Same outfit and wizard hat but tiny. She is standing center frame holding her belly laughing. Sparkle dust around her wings. Fully visible with lots of white space. No shadows, no scenery.`,
    videoPrompt: `The tiny fairy girl laughs hysterically — holding her belly, knees buckling, stumbling sideways. Her wizard hat tumbles off. Golden sparkle dust puffs from her wings with each heave of laughter. She's absolutely losing it. Cartoon animation. White background.`,
  },
  {
    name: "fairy-cece-tumble",
    aspect: "9:16",
    refs: ["cece"],
    imagePrompt: `FULL BODY illustration on PURE WHITE background. A TINY fairy version of the girl — miniature with delicate translucent iridescent butterfly wings on her back. Same outfit and wizard hat. She is mid-somersault in the air center frame, golden sparkle trail behind her. Fully visible with lots of white space. No shadows, no scenery.`,
    videoPrompt: `The tiny fairy performs graceful acrobatic tumbles and somersaults — spinning, looping, diving, twirling. Golden sparkle dust trails behind her every movement. Her wizard hat stays on magically. She giggles the whole time. All movement stays well within frame. Cartoon animation. White background.`,
  },
  {
    name: "cece-huey-dance",
    aspect: "9:16",
    refs: ["cece", "huey"],
    imagePrompt: `FULL BODY illustration on PURE WHITE background. Wide shot showing the girl and a chunky cartoon dog side by side. ${HUEY_IN_STYLE} Both in mid-dance pose — girl with arms up, dog standing on hind legs. Music notes floating. Both fully visible with space around them. No shadows, no scenery.`,
    videoPrompt: `The girl bounces from foot to foot waving her arms while the chunky dog attempts to copy her — spinning in clumsy circles, hopping on stubby legs, tongue flapping. Musical notes and sparkles float around them. Pure joy and silliness. Cartoon animation. White background.`,
  },
  {
    name: "cece-alex-highfive",
    aspect: "9:16",
    refs: ["cece", "alex"],
    imagePrompt: `FULL BODY illustration on PURE WHITE background. Wide shot of TWO characters facing each other: the girl on the left and a teen wizard girl on the right. ${ALEX_IN_STYLE} Both with one hand raised, about to high five, huge grins. Magical energy between their hands. Both fully visible with space around them. No shadows, no scenery.`,
    videoPrompt: `Both girls run at each other and leap for an epic mid-air high five. When their hands connect, a massive shockwave of purple and gold energy bursts outward in rings. Both hang in the air for a beat with triumphant grins. Cartoon animation. White background.`,
  },
  {
    name: "cece-wand-point",
    aspect: "9:16",
    refs: ["cece"],
    imagePrompt: `UPPER BODY illustration on PURE WHITE background. The girl center frame, thrusting her wand forward toward the viewer. One eye narrowed, mischievous confident smirk. Wand tip crackling with purple and gold energy. Wizard hat on. Fully visible from waist up. No shadows, no scenery.`,
    videoPrompt: `The wand tip crackles with building purple and gold electrical energy, sparks arcing and growing more intense. She gives a playful wink. The energy reaches a crescendo and fires a sparkle blast toward the viewer. Cartoon animation. White background.`,
  },
  {
    name: "intro-all-laughing",
    aspect: "16:9",
    refs: ["cece", "alex"],
    imagePrompt: `FULL BODY WIDE illustration on PURE WHITE background. LANDSCAPE orientation showing TWO characters side by side center frame: the girl on the left and a teen wizard girl on the right (${ALEX_IN_STYLE}). Both are laughing together — the girl's head thrown back in giggles, the teen girl doubled over with one hand on the younger girl's shoulder. Both fully visible with comfortable space around them. No shadows, no scenery.`,
    videoPrompt: `Both girls laugh together — the younger girl throws her head back giggling while the teen wizard girl doubles over laughing. They lean on each other for support, nearly falling over from laughing so hard. Warm, joyful, infectious laughter. Sparkles drift around them. Cartoon animation. White background.`,
  },
  // ── Slide 02 foreground: Alex speaking ──
  {
    name: "slide02-alex-star",
    aspect: "9:16",
    refs: ["alex"],
    imagePrompt: `FULL BODY illustration on PURE WHITE background. DO NOT draw the younger girl from the reference — instead draw ONLY the OLDER teen wizard girl from the second reference image (${ALEX_IN_STYLE}). She is standing alone center frame, looking up at the sky with wide eyes and a knowing smile. One hand shielding her eyes as she gazes upward at a bright golden star above her. Her red wand is gripped tightly at her side. She is OLDER and TALLER than the girl in the first reference — a teenager, not a child. Long straight dark brown hair, olive skin, colorful striped dress. NO wizard hat. NO glasses. NO locs. NO other characters. Fully visible with space around her. No shadows, no scenery.`,
    videoPrompt: `The teen girl with long dark hair gazes up at a bright golden star streaking across the sky above her. Her eyes follow it with growing recognition and excitement. She grips her red wand tighter, nods knowingly — she understands this star is choosing someone. She looks determined, ready to pass on her power. A golden glow washes over her face from the star above. Cartoon animation. White background. Only this one teen character, no one else.`,
  },
  // ── Slide foreground animations ──
  // These can replace static foreground PNGs on story slides
  {
    name: "slide03-cece-receives-wand",
    aspect: "9:16",
    refs: ["cece"],
    imagePrompt: `FULL BODY illustration on PURE WHITE background. The girl standing center frame with her hands outstretched, palms up, looking amazed with wide sparkling eyes and open mouth. She is about to receive something magical. Small golden sparkles drift around her open hands. Wizard hat on. Fully visible. No shadows, no scenery.`,
    videoPrompt: `The girl's outstretched hands begin to glow with golden light. A magical wand materializes in her hands in a shower of sparkles. Her eyes go even wider, her mouth drops open in pure wonder and joy. She grips the wand and it pulses with energy. She lifts it up triumphantly. Cartoon animation. White background.`,
  },
  {
    name: "slide05-tiny-cece-wave",
    aspect: "9:16",
    refs: ["cece"],
    imagePrompt: `FULL BODY illustration on PURE WHITE background. A TINY miniature version of the girl — like a little doll-sized figure inside a glowing magical sphere/bubble. Same outfit, wizard hat, glasses, locs. She is waving at the viewer with a big friendly smile. The bubble glows softly with purple light. Fully visible center frame. No shadows, no scenery.`,
    videoPrompt: `The tiny girl inside the glowing bubble waves enthusiastically at the viewer, bouncing around inside the bubble. She presses her face against the bubble wall making a funny squished face, then spins around doing a little dance. The bubble bobs gently. Sparkle dust swirls inside. Cartoon animation. White background.`,
  },
  {
    name: "slide07-finale-group",
    aspect: "9:16",
    refs: ["cece", "alex"],
    imagePrompt: `FULL BODY illustration on PURE WHITE background. TWO characters center frame: the girl on the left holding her wand up high looking powerful and confident, and the teen wizard girl on the right (${ALEX_IN_STYLE}) with her arm around the younger girl's shoulder looking proud. Both fully visible with space around them. No shadows, no scenery.`,
    videoPrompt: `The younger girl raises her wand and it erupts with golden light. The teen wizard girl claps and cheers next to her. Magical sparkles rain down like confetti. The younger girl beams with confidence — she is the family wizard now. Both celebrate together. Cartoon animation. White background.`,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

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
  return { base64: fs.readFileSync(filePath).toString("base64"), mimeType };
}

// ── Step 1: Generate starting frame image with Gemini ────────────────

async function generateStartFrame(ai, refs, clip) {
  // Use Cece base prompt only if Cece is in refs, otherwise use a generic style prompt
  const hasCece = clip.refs.includes("cece");
  const basePrompt = hasCece ? IMAGE_BASE_PROMPT : `Generate an illustration matching the character shown in the reference image. Same bold cartoon/comic art style with strong black outlines and flat colors. Very expressive.\n\n`;
  const prompt = basePrompt + clip.imagePrompt;
  const imageParts = [];
  // Only send the reference images the clip actually needs
  if (clip.refs.includes("cece") && refs.cece) {
    imageParts.push({ inlineData: { mimeType: "image/png", data: refs.cece.base64 } });
  }
  if (clip.refs.includes("huey") && refs.huey) {
    imageParts.push({ inlineData: { mimeType: refs.huey.mimeType, data: refs.huey.base64 } });
  }
  if (clip.refs.includes("alex") && refs.alex) {
    imageParts.push({ inlineData: { mimeType: refs.alex.mimeType, data: refs.alex.base64 } });
  }
  // Fallback: if no refs specified, send Cece
  if (imageParts.length === 0 && refs.cece) {
    imageParts.push({ inlineData: { mimeType: "image/png", data: refs.cece.base64 } });
  }

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: "user", parts: [...imageParts, { text: prompt }] }],
    config: { responseModalities: ["TEXT", "IMAGE"] },
  });

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data;
  }
  return null;
}

// ── Step 2: Animate frame with Veo ───────────────────────────────────

async function animateFrame(ai, frameBase64, clip) {
  let operation = await ai.models.generateVideos({
    model: VIDEO_MODEL,
    prompt: clip.videoPrompt,
    image: { imageBytes: frameBase64, mimeType: "image/png" },
    config: {
      aspectRatio: clip.aspect,
      numberOfVideos: 1,
      durationSeconds: 8,
    },
  });

  let pollCount = 0;
  while (!operation.done) {
    pollCount++;
    if (pollCount % 6 === 0) console.log(`    Still generating... (${pollCount * 10}s)`);
    await new Promise(r => setTimeout(r, 10000));
    operation = await ai.operations.getVideosOperation({ operation });
  }

  const videos = operation.response?.generatedVideos;
  if (!videos || videos.length === 0) return null;
  return videos[0].video;
}

// ── Step 3: Remove background ────────────────────────────────────────

async function removeBackground(inputMp4, outputWebm, clipName) {
  const tempDir = path.join(TEMP_FRAMES_DIR, clipName);
  fs.mkdirSync(tempDir, { recursive: true });

  // Extract frames — crop 10% top + 8% bottom to fully remove Veo black bars
  console.log("    Extracting frames...");
  execSync(
    `ffmpeg -y -i "${inputMp4}" -vf "crop=iw:ih*0.82:0:ih*0.10,fps=24" "${tempDir}/frame-%04d.png" 2>/dev/null`,
    { stdio: "pipe" }
  );

  const frames = fs.readdirSync(tempDir).filter(f => f.endsWith(".png")).sort();
  console.log(`    AI background removal on ${frames.length} frames...`);

  // Use @imgly/background-removal-node for smart AI-based removal
  // Handles enclosed areas (between arms, gaps in hair, etc.)
  const { removeBackground } = await import("@imgly/background-removal-node");

  // Process frames in batches of 8 for memory management
  const BATCH = 8;
  for (let i = 0; i < frames.length; i += BATCH) {
    const batch = frames.slice(i, i + BATCH);
    await Promise.all(batch.map(async (frame) => {
      const p = path.join(tempDir, frame);
      const jpgPath = p.replace(".png", ".jpg");
      try {
        // Convert to JPG (imgly needs it)
        execSync(`magick "${p}" "${jpgPath}"`, { stdio: "pipe" });
        const result = await removeBackground(`file://${jpgPath}`);
        const buf = Buffer.from(await result.arrayBuffer());
        fs.writeFileSync(p, buf);
        fs.unlinkSync(jpgPath);
      } catch (e) {
        // Fallback: ImageMagick floodfill
        try { fs.unlinkSync(jpgPath); } catch (_) {}
        try {
          const id = execSync(`magick identify -format "%w %h" "${p}"`, { encoding: "utf-8" }).trim();
          const [w, h] = id.split(" ").map(Number);
          execSync(
            `magick "${p}" -bordercolor white -border 1 -alpha set -fuzz 10% -fill none ` +
            `-draw "color 0,0 floodfill" -draw "color ${w+1},0 floodfill" ` +
            `-draw "color 0,${h+1} floodfill" -draw "color ${w+1},${h+1} floodfill" ` +
            `-shave 1x1 "${p}"`,
            { stdio: "pipe" }
          );
        } catch (_) {}
      }
    }));
    if (i + BATCH < frames.length) {
      process.stdout.write(`    ${i + BATCH}/${frames.length} frames done\r`);
    }
  }
  console.log(`    ${frames.length}/${frames.length} frames done`);

  // Scale frames down for web, then assemble as animated WebP with alpha
  // Using img2webp (not ffmpeg) because ffmpeg 8.x has broken VP9 alpha encoding
  console.log("    Scaling frames for web...");
  const scaledDir = tempDir + "-scaled";
  fs.mkdirSync(scaledDir, { recursive: true });
  // Get dimensions from first frame to enforce consistency
  const firstId = execSync(`magick identify -format "%w %h" "${path.join(tempDir, frames[0])}"`, { encoding: "utf-8" }).trim();
  const [srcW, srcH] = firstId.split(" ").map(Number);
  const aspect = srcW / srcH;
  const targetW = Math.min(480, srcW);
  const targetH = Math.round(targetW / aspect);
  // Force all frames to exact same dimensions (prevents img2webp mismatch errors)
  for (const frame of frames) {
    execSync(
      `magick "${path.join(tempDir, frame)}" -resize "${targetW}x${targetH}!" "${path.join(scaledDir, frame)}"`,
      { stdio: "pipe" }
    );
  }

  // Trim black bars from scaled frames — the resize can add black letterboxing
  console.log("    Trimming black bars...");
  for (const sf of fs.readdirSync(scaledDir).filter(f => f.endsWith(".png"))) {
    const fp = path.join(scaledDir, sf);
    // Trim transparent/black edges, then re-center on a consistent canvas
    execSync(`magick "${fp}" -fuzz 5% -trim +repage "${fp}"`, { stdio: "pipe" });
  }
  // After trim, force all frames to the same size (use first frame as reference)
  const scaledFrames = fs.readdirSync(scaledDir).filter(f => f.endsWith(".png")).sort();
  const refId = execSync(`magick identify -format "%w %h" "${path.join(scaledDir, scaledFrames[0])}"`, { encoding: "utf-8" }).trim();
  const [refW, refH] = refId.split(" ").map(Number);
  for (const sf of scaledFrames) {
    execSync(`magick "${path.join(scaledDir, sf)}" -resize "${refW}x${refH}!" "${path.join(scaledDir, sf)}"`, { stdio: "pipe" });
  }

  // Skip every other frame (24fps → 12fps) for reasonable file size
  const finalFrames = scaledFrames.filter((_, i) => i % 2 === 0);
  // Assemble animated WebP — play once (no loop), 12fps, good quality
  const webpOut = outputWebm.replace(/\.webm$/, ".webp");
  const frameArgs = finalFrames.map(f => `"${path.join(scaledDir, f)}"`).join(" ");
  console.log(`    Assembling animated WebP (${finalFrames.length} frames @ 12fps, ${refW}x${refH})...`);
  execSync(`img2webp -loop 1 -d 83 -lossy -q 70 ${frameArgs} -o "${webpOut}"`, { stdio: "pipe" });

  // Clean up
  fs.rmSync(scaledDir, { recursive: true, force: true });
  fs.rmSync(tempDir, { recursive: true, force: true });
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const dryRun = hasFlag("dry-run");
  const processOnly = hasFlag("process-only");
  const startFrom = getArg("start-from");

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey && !dryRun && !processOnly) {
    console.error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
    process.exit(1);
  }

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

  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(STARTFRAME_DIR, { recursive: true });
  fs.mkdirSync(TRANSPARENT_DIR, { recursive: true });

  console.log(`Image model: ${IMAGE_MODEL}`);
  console.log(`Video model: ${VIDEO_MODEL}`);
  console.log(`Clips: ${clips.length}\n`);

  if (dryRun) {
    for (const c of clips) {
      console.log(`  ${c.name} (${c.aspect}):`);
      console.log(`    refs: ${c.refs.join(", ")}`);
      console.log(`    image: ${c.imagePrompt.substring(0, 100)}...`);
      console.log(`    video: ${c.videoPrompt.substring(0, 100)}...`);
      console.log();
    }
    return;
  }

  if (processOnly) {
    console.log("=== PROCESS ONLY ===\n");
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const rawPath = path.join(RAW_DIR, `${clip.name}.mp4`);
      if (!fs.existsSync(rawPath)) { console.log(`[${i + 1}] SKIP ${clip.name}`); continue; }
      console.log(`[${i + 1}] Processing: ${clip.name}...`);
      removeBackground(rawPath, path.join(TRANSPARENT_DIR, `${clip.name}.webm`), clip.name);
      console.log(`[${i + 1}] Done`);
    }
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  let success = 0, failed = 0;

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const framePath = path.join(STARTFRAME_DIR, `${clip.name}.png`);
    const rawPath = path.join(RAW_DIR, `${clip.name}.mp4`);
    const transparentPath = path.join(TRANSPARENT_DIR, `${clip.name}.webm`);

    console.log(`[${i + 1}/${clips.length}] === ${clip.name} (${clip.aspect}) ===`);

    try {
      // Step 1: Generate starting frame
      console.log(`  Step 1: Generating start frame...`);
      const frameBase64 = await generateStartFrame(ai, refs, clip);
      if (!frameBase64) {
        console.log(`  FAIL — no image returned`);
        failed++;
        continue;
      }
      fs.writeFileSync(framePath, Buffer.from(frameBase64, "base64"));
      console.log(`  Start frame saved: ${clip.name}.png`);

      // Step 2: Animate with Veo
      console.log(`  Step 2: Animating with Veo...`);
      const videoFile = await animateFrame(ai, frameBase64, clip);
      if (!videoFile) {
        console.log(`  FAIL — no video returned`);
        failed++;
        continue;
      }
      await ai.files.download({ file: videoFile, downloadPath: rawPath });
      console.log(`  Raw MP4 saved: ${clip.name}.mp4`);

      // Step 3: Remove background
      console.log(`  Step 3: Removing background...`);
      removeBackground(rawPath, transparentPath, clip.name);
      console.log(`  Transparent WebM saved: ${clip.name}.webm`);

      success++;
      console.log(`[${i + 1}/${clips.length}] DONE: ${clip.name}\n`);
    } catch (e) {
      console.log(`[${i + 1}/${clips.length}] ERROR: ${e.message}\n`);
      failed++;
    }
  }

  // Clean up temp frames dir
  if (fs.existsSync(TEMP_FRAMES_DIR)) {
    fs.rmSync(TEMP_FRAMES_DIR, { recursive: true, force: true });
  }

  console.log(`\n=== Done ===`);
  console.log(`Success: ${success} | Failed: ${failed}`);
  console.log(`Start frames: ${STARTFRAME_DIR}`);
  console.log(`Raw MP4s: ${RAW_DIR}`);
  console.log(`Transparent WebMs: ${TRANSPARENT_DIR}`);
}

main().catch(console.error);
