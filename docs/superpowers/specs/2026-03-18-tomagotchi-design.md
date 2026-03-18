# Tomagotchi Features for Cece — Design Spec

**Date**: 2026-03-18
**Target**: M5StickC Plus 2 device firmware (`device/`)
**Audience**: 9-year-old, birthday gift — simple, forgiving, fun

## Overview

Add a single-stat tomagotchi system to Cece. A **happiness** score (0–100) persists across power cycles and decays gently over real time (-1/hour). Cece can never die or get sick — she just gets grumpy and bounces back quickly when you interact. All existing features (toss/catch, tilt reactions, BLE wand mode, Ably streaming) remain intact.

## Happiness System

### Stat: Happiness (0–100, default 50)

| Action | Effect | Notes |
|--------|--------|-------|
| Tap/hit | -5 | Existing tap-annoyed/angry sprites + texts |
| Toss + catch | +10 | Existing catch celebration sprites |
| Toss + lost (3s timeout) | -15 | Existing lost sprites |
| Feed (BtnA short press) | +8 | No effect above 80 (can't spam feed) |
| Pet/gentle rock | +3 | Gentle IMU tilt oscillation, 30s cooldown |
| Time decay | -1/hour | Via NTP timestamp diff |
| Wake from sleep | Clamp to min 20 | Never devastated on return |

Floor: 0. Ceiling: 100.

### Mood Tiers (affect idle sprite pool + text)

| Range | Mood | Idle Sprites |
|-------|------|-------------|
| 80–100 | Happy | wave, hum, spell-practice, wand-twirl (upbeat pool) |
| 50–79 | Content | All 12 idle sprites (current behavior) |
| 20–49 | Grumpy | yawn, sitting, looking-left, looking-right (bored pool) |
| 0–19 | Sad | sad-1, sad-2, yawn (new sad sprites + existing yawn) |

### Gentle Rocking / Petting Detection

Detect slow, rhythmic tilting via IMU:
- Monitor `imuAx` (side-to-side rocking in portrait orientation) for oscillation crossing zero repeatedly
- Require 3+ oscillations within ~4 seconds at gentle magnitude (0.2–0.6g range)
- Distinct from tap (which is a sharp impulse) and toss (which is high-g)
- **Disabled during active toss states** (TOSS_LAUNCHED, TOSS_FREEFALL, TOSS_CAUGHT) to avoid false triggers from tumbling
- 30-second cooldown between petting rewards
- Shows `pet` sprite + affectionate text ("Mmmm...", "That's nice~", "Cozy...", "*purrs*", "More please!")

### Feed Cap Semantics

"No effect above 80" means: if `happiness >= 80`, feeding does nothing (no sprite, no text, no change). If `happiness < 80`, feeding adds +8 and the result is clamped to 100 (so feeding at 75 → 83, feeding at 78 → 86). The cap prevents spam-feeding to max, not clamping the result to 80.

### Text Pools for New States

**Feed texts**: "Yum!", "Nom nom!", "Tasty~", "More leaves!", "*munch munch*", "So good!"
**Pet texts**: "Mmmm...", "That's nice~", "Cozy...", "*purrs*", "More please!"
**Sad mood idle texts**: "...", "*sigh*", "Lonely...", "Hello?", "*sniff*"

## Button Mapping

### Press Detection Strategy

Short press vs long press requires firing short-press actions **on release** (not on press). Use M5Unified's `wasReleaseFor(ms)` to detect short release (<1.5s) and `pressedFor(1500)` for long press. This is a change from current `wasPressed()` pattern.

- **Short press**: fires when button is released AND was held <1.5s
- **Long press**: fires when `pressedFor(1500)` becomes true (while still held)

### Active Mode (default)

| Input | Action |
|-------|--------|
| BtnA short press (release <1.5s) | Feed Cece — feeding animation, +8 happiness (ignored if happiness >= 80, ignored during active toss) |
| BtnA long press (>1.5s) | Toggle BLE on/off (persisted in NVS) |
| BtnB short press (release <1.5s) | Show stats — happiness bar + mood text for 3s |
| BtnB long press (>1.5s) | Enter Debug mode |

### Feed Animation Sequence

1. Show `feed-1` sprite for 600ms + text from feed pool
2. Show `feed-2` sprite for 800ms + "Yum!" or similar
3. Return to idle

Feed is ignored during active toss states (TOSS_LAUNCHED, TOSS_FREEFALL, TOSS_CAUGHT).

### Debug Mode

| Input | Action |
|-------|--------|
| BtnA short press | Toggle wand mount (persisted in NVS) |
| BtnB short press | Exit Debug mode (return to Active) |
| BtnB long press (>1.5s) | Exit Debug mode (return to Active) |

No tomagotchi actions (feed, happiness changes) occur in debug mode.

## New Sprites (5 total, ~240KB flash)

Generated via existing Gemini pipeline (`stickman/scripts/generate-sprite-color.mjs`).

| Sprite | Framing | Description |
|--------|---------|-------------|
| `feed-1` | close-up | Cece holding a leaf/fruit, excited expression |
| `feed-2` | close-up | Cece munching happily, crumbs around mouth |
| `pet` | close-up | Eyes closed, content smile (being rocked) |
| `sad-1` | close-up | Droopy eyes, mopey expression |
| `sad-2` | close-up | Looking down, "*sigh*" energy |

All other states covered by existing 40 sprites.

## Persistence (NVS)

Two new keys in existing `"stickman"` namespace:

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `happiness` | u8 | 50 | Current happiness score |
| `last_ts` | u32 | 0 | Unix timestamp of last happiness update |

### Save triggers
- After every happiness-changing event (tap, catch, feed, pet)
- On entering sleep mode
- Every 10 minutes during idle (guards against unexpected power loss)

### Time decay on boot
Time decay is computed **after WiFi connects and NTP succeeds** (not at boot start). WiFi connects asynchronously, so decay calculation is deferred until NTP time is available.

1. Read `happiness` and `last_ts` from NVS
2. Wait for NTP time (via `configTime()` + `getLocalTime()` after WiFi connects)
3. Guard: if `now < last_ts` (clock went backwards from NTP correction), skip decay
4. `hours_elapsed = (now - last_ts) / 3600` (integer truncation is intentional — generous for a kid)
5. `happiness -= hours_elapsed` (clamped to 0)
6. Clamp to minimum 20 on wake
7. Write updated values back

### Edge cases
- NTP fails (no WiFi) → skip time decay, use stored happiness as-is
- First boot (no NVS keys) → initialize happiness=50, last_ts=now
- `now < last_ts` (NTP clock correction) → skip time decay
- Overflow → clamp 0–100 always

## Ably Streaming

New event published on happiness changes:

```json
{"event": "happiness", "value": 75, "mood": "content", "cause": "feed"}
```

Existing events (imu, btn, gesture, toss, mode) unchanged.

## Display Layout (unchanged)

- Title bar: y 0–19 (20px) — "~ Cece ~" / "~ Wand ~" / debug info
- Sprite area: y 20–199 (135x180) — sprites as today
- Text area: y 200–239 (40px) — reaction text, stats overlay

### Stats overlay (BtnB short press in Active mode)
- Small happiness bar drawn in text area (or across bottom of sprite area)
- Mood label text (Happy / Content / Grumpy / Sad)
- Auto-dismisses after 3 seconds

## What Stays the Same

- All toss/catch/lost detection and sprites
- All tilt-reactive sprites (left/right/upside-down)
- BLE HID keyboard (tap → KEY_RETURN, tilt → arrows when BLE on)
- Ably streaming (all existing events)
- Sleep/wake animations and timing
- Debug mode info screen
- WiFi + Ably auto-connect on boot

## What Changes

- BtnA in Active mode: was BLE cycle → now Feed (short) / BLE toggle (long)
- BtnB in Active mode: was toggle Active/Debug → now Stats (short) / Debug (long)
- BtnA in Debug mode: was wand mount toggle → stays wand mount toggle
- BtnB in Debug mode: was toggle to Active → stays toggle to Active
- Idle sprite pool selection: was random from all 12 → now mood-filtered
- Tap reaction: was cosmetic only → now also -5 happiness
- Toss catch: was cosmetic only → now also +10 happiness
- Toss lost: was cosmetic only → now also -15 happiness
- New: feeding action, petting detection, happiness persistence, time decay
