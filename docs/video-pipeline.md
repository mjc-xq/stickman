# Video Animation Pipeline

## Overview

Generates animated clips of Cece and friends for the story web app using a two-step AI pipeline, then processes them for transparent overlay on slides.

## Pipeline Steps

### Step 1: Generate Starting Frame (Gemini)
- **Model**: `gemini-3.1-flash-image-preview`
- **Input**: Character reference image(s) + pose description prompt
- **Output**: Single PNG illustration on white background
- **Key**: Only send reference images for characters in the clip (e.g., Alex-only clips get only the Alex reference, not Cece's)

### Step 2: Animate Frame (Veo)
- **Model**: `veo-3.1-generate-preview`
- **Input**: Starting frame PNG + animation description prompt
- **Output**: 8-second MP4 at 720x1280 (9:16) or 1280x720 (16:9)
- **Config**: `aspectRatio`, `numberOfVideos: 1`, `durationSeconds: 8`
- **Note**: Veo always adds ~7% black bars at top and ~5% at bottom

### Step 3: Background Removal
- **Method**: Edge floodfill from 8 points (same as sprite pipeline)
- **Why this method**: Preserves enclosed white areas (eyes, teeth) while removing connected white background. AI removal was too aggressive (removed character parts). `-transparent white` removed eyes. Green screen caused fringe artifacts.
- **Fuzz**: 15% on white
- **Command per frame**:
  ```bash
  magick FRAME -bordercolor white -border 1 -alpha set -fuzz 15% -fill none \
    -draw "color 0,0 floodfill" -draw "color W+1,0 floodfill" \
    -draw "color 0,H+1 floodfill" -draw "color W+1,H+1 floodfill" \
    -draw "color MX,0 floodfill" -draw "color MX,H+1 floodfill" \
    -draw "color 0,MY floodfill" -draw "color W+1,MY floodfill" \
    -shave 1x1 FRAME
  ```

### Step 4: Scale + Trim + Assemble
1. **Crop**: `ffmpeg crop=iw:ih*0.82:0:ih*0.10` (removes Veo black bars)
2. **Extract**: 8fps (64 frames for 8s video)
3. **Scale**: `magick -resize 480x`
4. **Trim**: `magick -fuzz 3% -trim +repage` (removes transparent edges)
5. **Force consistent size**: All frames to same dimensions (prevents img2webp errors)
6. **Assemble**: `img2webp -loop 1 -d 125 -lossy -q 75` (8fps, play once, freeze on last frame)

## Output Format

- **Animated WebP** with alpha channel via `img2webp` (not ffmpeg — ffmpeg 8.0 has broken VP9 alpha)
- `-loop 1` = play once then freeze on last frame (no looping)
- `-d 125` = 125ms per frame = 8fps
- `-q 75` = good quality for cartoon animation
- Typical size: 1-4MB per clip

## File Structure

```
public/videos/
├── raw/           # Original Veo MP4s (gitignored)
├── startframes/   # Gemini-generated first frame PNGs (gitignored)
├── animated/      # Final animated WebPs with alpha (tracked in git)
└── .frames/       # Temp processing dir (auto-cleaned)
```

## Script

`stickman/scripts/generate-videos.mjs`

```bash
node scripts/generate-videos.mjs                         # generate all clips
node scripts/generate-videos.mjs --start-from clip-name   # resume from specific clip
node scripts/generate-videos.mjs --process-only           # re-process existing raw MP4s
node scripts/generate-videos.mjs --dry-run                # preview prompts
```

## Current Clips

| Clip | Slide | Description |
|------|-------|-------------|
| intro-all-laughing | 01 Title | Cece + Alex laughing (landscape) |
| slide02-alex-star | 02 Star | Alex alone looking at birthday star |
| slide03-cece-receives-wand | — | Cece receiving the wand |
| slide05-tiny-cece-wave | — | Tiny fairy Cece waving |
| cece-levitate | 06 Montage | Cece levitating with magic |
| cece-turns-alex-cat | 06 Montage | Cece turns Alex into a cat |
| cece-alex-highfive | 06 Montage | Epic magical high five |
| cece-wand-wave | — | Cece waving wand with sparkles |
| cece-wand-point | 07 Finale | Cece pointing wand at viewer |
| fairy-cece-fly | — | Fairy Cece tumbling with sparkles |
| slide07-finale-group | 07 Finale | Cece + Alex celebrating |

## Background Removal Methods Tried

| Method | Result |
|--------|--------|
| Edge floodfill (current) | Best — preserves eyes, handles most backgrounds. Misses enclosed white between arms. |
| `-transparent white` | Removes ALL white including eyes and teeth. Unacceptable. |
| AI (@imgly/background-removal-node) | Too slow (2s/frame), sometimes removes character parts. |
| Green screen + chromakey | Green fringe on edges, added complexity, Alex's dress clashed. |

## API Costs

- Veo 3.1: ~$1.20-$3.20 per 8-second clip
- Gemini image: negligible
- Total for current set: ~$20-30

## Requirements

- `@google/genai` (npm) — Gemini + Veo API
- `img2webp` (brew: `brew install webp`) — animated WebP assembly
- `magick` (ImageMagick 7) — frame processing
- `ffmpeg` — frame extraction + cropping
- `GOOGLE_GENERATIVE_AI_API_KEY` in `.env.local`
