# Tomagotchi Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-stat happiness tomagotchi system to Cece with gentle real-time decay, feeding, petting, mood-filtered idle sprites, and 5 new AI-generated sprites.

**Architecture:** Happiness (u8, 0-100) persisted in NVS with timestamp. Time decay via NTP after WiFi connect. Buttons remapped: BtnA short=feed, long=BLE toggle; BtnB short=stats, long=debug. Mood tiers filter idle sprite pools. New petting detection via IMU oscillation.

**Tech Stack:** PlatformIO/Arduino, M5StickC Plus 2, ESP32 NVS, NTP, Gemini API (sprite generation)

**Spec:** `docs/superpowers/specs/2026-03-18-tomagotchi-design.md`

---

### Task 1: Generate New Sprites

**Files:**
- Modify: `stickman/scripts/generate-sprite-color.mjs` (add 5 new sprite definitions to array)
- Modify: `stickman/scripts/convert-sprites-to-header.mjs` (add 5 new names to SPRITE_NAMES)
- Output: `stickman/public/images/sprite-color/feed-1.png`, `feed-2.png`, `pet.png`, `sad-1.png`, `sad-2.png`
- Output: `device/src/sprites.h` (regenerated with 52 sprites total)

- [ ] **Step 1: Add 5 new sprite definitions to generate-sprite-color.mjs**

Add to the sprites array (after the last idle sprite):
```javascript
{ name: "feed-1", frame: "face", desc: "Cece holding a big green leaf in both hands, looking at it with wide excited eyes and an open-mouth smile, about to take a bite" },
{ name: "feed-2", frame: "face", desc: "Cece mid-bite, munching on a leaf with puffy cheeks, eyes squeezed shut with delight, small crumbs and leaf bits around mouth" },
{ name: "pet", frame: "face", desc: "Cece with eyes gently closed, peaceful dreamy smile, head slightly tilted, looking deeply content and cozy as if being rocked to sleep" },
{ name: "sad-1", frame: "face", desc: "Cece with big droopy sad eyes looking slightly up at the viewer, mouth in a small frown, eyebrows tilted up in the middle, lonely expression" },
{ name: "sad-2", frame: "face", desc: "Cece looking down and to the side, eyes half-closed, one hand on cheek, heavy sigh expression, slightly slouched posture" },
```

- [ ] **Step 2: Add 5 new names to convert-sprites-to-header.mjs SPRITE_NAMES**

Add after the last idle entry (`"idle-wave"`):
```javascript
"feed-1",
"feed-2",
"pet",
"sad-1",
"sad-2",
```

- [ ] **Step 3: Generate the 5 new sprite PNGs**

```bash
cd stickman
node scripts/generate-sprite-color.mjs --start-from feed-1
```
Expected: 5 new PNG files in `public/images/sprite-color/`

- [ ] **Step 4: Regenerate sprites.h with all 52 sprites**

```bash
cd stickman
node scripts/convert-sprites-to-header.mjs
```
Expected: `device/src/sprites.h` regenerated with SPRITE_COUNT = 52, new enums SPRITE_FEED_1 (47), SPRITE_FEED_2 (48), SPRITE_PET (49), SPRITE_SAD_1 (50), SPRITE_SAD_2 (51)

- [ ] **Step 5: Commit**

```bash
git add stickman/scripts/generate-sprite-color.mjs stickman/scripts/convert-sprites-to-header.mjs stickman/public/images/sprite-color/feed-*.png stickman/public/images/sprite-color/pet.png stickman/public/images/sprite-color/sad-*.png device/src/sprites.h
git commit -m "feat(sprites): add 5 tomagotchi sprites (feed, pet, sad)"
```

---

### Task 2: Add Happiness NVS Persistence + NTP Time Sync

**Files:**
- Modify: `device/src/main.cpp` (add NVS functions, NTP setup, time decay logic)

- [ ] **Step 1: Add happiness state variables**

After existing state variables (~line 124), add:
```cpp
// ── Happiness (tomagotchi) ──
static uint8_t happiness = 50;
static uint32_t lastHappinessTs = 0;  // unix timestamp
static bool ntpSynced = false;
```

- [ ] **Step 2: Add NVS read/write functions for happiness**

After existing NVS functions (~line 197), add:
```cpp
static uint8_t nvsReadHappiness() {
  nvs_handle_t h;
  uint8_t val = 50;
  if (nvs_open("stickman", NVS_READONLY, &h) == ESP_OK) {
    nvs_get_u8(h, "happiness", &val);
    nvs_close(h);
  }
  return val;
}

static void nvsWriteHappiness(uint8_t val) {
  nvs_handle_t h;
  if (nvs_open("stickman", NVS_READWRITE, &h) == ESP_OK) {
    nvs_set_u8(h, "happiness", val);
    nvs_commit(h);
    nvs_close(h);
  }
}

static uint32_t nvsReadLastTs() {
  nvs_handle_t h;
  uint32_t val = 0;
  if (nvs_open("stickman", NVS_READONLY, &h) == ESP_OK) {
    nvs_get_u32(h, "last_ts", &val);
    nvs_close(h);
  }
  return val;
}

static void nvsWriteLastTs(uint32_t val) {
  nvs_handle_t h;
  if (nvs_open("stickman", NVS_READWRITE, &h) == ESP_OK) {
    nvs_set_u32(h, "last_ts", val);
    nvs_commit(h);
    nvs_close(h);
  }
}
```

- [ ] **Step 3: Add changeHappiness helper and Ably publish**

```cpp
static void changeHappiness(int8_t delta, const char* cause) {
  int16_t val = (int16_t)happiness + delta;
  if (val < 0) val = 0;
  if (val > 100) val = 100;
  happiness = (uint8_t)val;

  struct tm ti;
  if (ntpSynced && getLocalTime(&ti, 0)) {
    time_t now;
    time(&now);
    lastHappinessTs = (uint32_t)now;
    nvsWriteLastTs(lastHappinessTs);
  }
  nvsWriteHappiness(happiness);

  // Publish to Ably
  char buf[96];
  const char* mood = happiness >= 80 ? "happy" : happiness >= 50 ? "content" : happiness >= 20 ? "grumpy" : "sad";
  snprintf(buf, sizeof(buf), "{\"value\":%d,\"mood\":\"%s\",\"cause\":\"%s\"}", happiness, mood, cause);
  publishEvent("happiness", buf);
}
```

- [ ] **Step 4: Add NTP setup after WiFi connects**

In `setup()`, after WiFi.begin() (~line 768), add NTP config:
```cpp
configTime(0, 0, "pool.ntp.org", "time.nist.gov");
```

Add an NTP sync check in the main loop (run once, early in STATE_READY):
```cpp
static bool ntpDecayApplied = false;
if (!ntpDecayApplied && WiFi.status() == WL_CONNECTED) {
  struct tm ti;
  if (getLocalTime(&ti, 0)) {
    ntpSynced = true;
    time_t now;
    time(&now);
    uint32_t nowTs = (uint32_t)now;
    if (lastHappinessTs > 0 && nowTs > lastHappinessTs) {
      uint32_t hoursElapsed = (nowTs - lastHappinessTs) / 3600;
      if (hoursElapsed > 0) {
        int16_t val = (int16_t)happiness - (int16_t)hoursElapsed;
        if (val < 20) val = 20;  // wake clamp
        happiness = (uint8_t)val;
        nvsWriteHappiness(happiness);
      }
    }
    lastHappinessTs = nowTs;
    nvsWriteLastTs(lastHappinessTs);
    ntpDecayApplied = true;
  }
}
```

- [ ] **Step 5: Read happiness + timestamp in setup()**

In `setup()`, after existing NVS reads (~line 764):
```cpp
happiness = nvsReadHappiness();
lastHappinessTs = nvsReadLastTs();
```

- [ ] **Step 6: Add periodic NVS save (every 10 min)**

In the main loop STATE_READY section, alongside existing periodic checks:
```cpp
static unsigned long lastNvsSave = 0;
if (now - lastNvsSave > 600000) {
  lastNvsSave = now;
  nvsWriteHappiness(happiness);
  if (ntpSynced) {
    time_t t; time(&t);
    nvsWriteLastTs((uint32_t)t);
  }
}
```

- [ ] **Step 7: Save happiness on sleep entry**

In `enterSleep()` (~line 710), before WiFi disconnect:
```cpp
nvsWriteHappiness(happiness);
if (ntpSynced) {
  time_t t; time(&t);
  nvsWriteLastTs((uint32_t)t);
}
```

- [ ] **Step 8: Commit**

```bash
git add device/src/main.cpp
git commit -m "feat(device): happiness NVS persistence + NTP time decay"
```

---

### Task 3: Remap Buttons (Short Press on Release + Long Press)

**Files:**
- Modify: `device/src/main.cpp` (button handling, ~lines 797-833)

- [ ] **Step 1: Add long-press tracking state**

After existing state variables:
```cpp
static bool btnAHeld = false;
static bool btnBHeld = false;
static bool btnALongFired = false;
static bool btnBLongFired = false;
```

- [ ] **Step 2: Replace BtnA handler**

Replace existing BtnA wasPressed/wasReleased block (~lines 797-820) with:
```cpp
// ── BtnA: track press/hold/release ──
if (M5.BtnA.wasPressed()) {
  btnAHeld = true;
  btnALongFired = false;
  publishEvent("btn", "{\"button\":\"A\",\"state\":\"down\"}");
}
if (btnAHeld && !btnALongFired && M5.BtnA.pressedFor(1500)) {
  btnALongFired = true;
  if (mode == MODE_ACTIVE) {
    // Long press: toggle BLE
    bleMode = bleMode ? 0 : 1;
    nvsWriteBleMode(bleMode);
    bleEnabled = (bleMode > 0);
    if (bleEnabled) {
      showSprite(pick(BLE_ON_SPRITES, BLE_ON_SPRITE_N), pick(BLE_ON_TEXTS, BLE_ON_TEXT_N));
    } else {
      showSprite(pick(BLE_OFF_SPRITES, BLE_OFF_SPRITE_N), pick(BLE_OFF_TEXTS, BLE_OFF_TEXT_N));
    }
    state = STATE_RESULT;
    stateTime = now;
  }
}
if (M5.BtnA.wasReleased()) {
  publishEvent("btn", "{\"button\":\"A\",\"state\":\"up\"}");
  if (btnAHeld && !btnALongFired) {
    // Short press released
    if (mode == MODE_ACTIVE && tossState == TOSS_IDLE) {
      // Feed action (Task 5)
    } else if (mode == MODE_DEBUG) {
      wandMount = !wandMount;
      nvsWriteWandMount(wandMount);
      showDebugScreen();
    }
  }
  btnAHeld = false;
}
```

- [ ] **Step 3: Replace BtnB handler**

Replace existing BtnB wasPressed/wasReleased block (~lines 822-835) with:
```cpp
// ── BtnB: track press/hold/release ──
if (M5.BtnB.wasPressed()) {
  btnBHeld = true;
  btnBLongFired = false;
  publishEvent("btn", "{\"button\":\"B\",\"state\":\"down\"}");
}
if (btnBHeld && !btnBLongFired && M5.BtnB.pressedFor(1500)) {
  btnBLongFired = true;
  if (mode == MODE_ACTIVE) {
    // Long press: enter debug
    mode = MODE_DEBUG;
    tossState = TOSS_IDLE;
    tapSettleCount = -1;
    showDebugScreen();
  }
}
if (M5.BtnB.wasReleased()) {
  publishEvent("btn", "{\"button\":\"B\",\"state\":\"up\"}");
  if (btnBHeld && !btnBLongFired) {
    if (mode == MODE_ACTIVE) {
      // Short press: show stats (Task 6)
    } else if (mode == MODE_DEBUG) {
      mode = MODE_ACTIVE;
      tossState = TOSS_IDLE;
      tapSettleCount = -1;
    }
  }
  btnBHeld = false;
}
```

- [ ] **Step 4: Commit**

```bash
git add device/src/main.cpp
git commit -m "feat(device): remap buttons — short on release, long press at 1.5s"
```

---

### Task 4: Add Text Pools + Mood-Filtered Idle Sprites

**Files:**
- Modify: `device/src/main.cpp` (text arrays ~line 370+, idle selection ~line 855+)

- [ ] **Step 1: Add new text pools**

After existing text pools (~line 488):
```cpp
// ── Feed texts ──
static const char* FEED_TEXTS[] = {
  "Yum!", "Nom nom!", "Tasty~", "More leaves!", "*munch munch*", "So good!"
};
static const int FEED_TEXT_N = 6;

// ── Pet texts ──
static const char* PET_TEXTS[] = {
  "Mmmm...", "That's nice~", "Cozy...", "*purrs*", "More please!"
};
static const int PET_TEXT_N = 5;

// ── Sad idle texts ──
static const char* SAD_TEXTS[] = {
  "...", "*sigh*", "Lonely...", "Hello?", "*sniff*"
};
static const int SAD_TEXT_N = 5;
```

- [ ] **Step 2: Add new sprite pools**

After existing sprite pools:
```cpp
// ── Feed sprites ──
static const SpriteIdx FEED_SPRITES[] = { SPRITE_FEED_1, SPRITE_FEED_2 };
static const int FEED_SPRITE_N = 2;

// ── Sad idle sprites ──
static const SpriteIdx SAD_IDLE_SPRITES[] = { SPRITE_SAD_1, SPRITE_SAD_2, SPRITE_IDLE_YAWN };
static const int SAD_IDLE_SPRITE_N = 3;

// ── Happy idle sprites (upbeat subset) ──
static const SpriteIdx HAPPY_IDLE_SPRITES[] = {
  SPRITE_IDLE_WAVE, SPRITE_IDLE_HUMMING_1, SPRITE_IDLE_HUMMING_2,
  SPRITE_IDLE_SPELL_PRACTICE, SPRITE_IDLE_WAND_TWIRL
};
static const int HAPPY_IDLE_SPRITE_N = 5;

// ── Grumpy idle sprites (bored subset) ──
static const SpriteIdx GRUMPY_IDLE_SPRITES[] = {
  SPRITE_IDLE_YAWN, SPRITE_IDLE_SITTING, SPRITE_IDLE_LOOKING_LEFT, SPRITE_IDLE_LOOKING_RIGHT
};
static const int GRUMPY_IDLE_SPRITE_N = 4;
```

- [ ] **Step 3: Add getMoodTier helper**

```cpp
static int getMoodTier() {
  if (happiness >= 80) return 3;  // happy
  if (happiness >= 50) return 2;  // content
  if (happiness >= 20) return 1;  // grumpy
  return 0;                       // sad
}
```

- [ ] **Step 4: Replace idle sprite selection with mood-filtered version**

Replace the idle sprite random pick (~line 858) with:
```cpp
int tier = getMoodTier();
SpriteIdx idleSprite;
const char* idleText;
if (tier == 3) {
  idleSprite = pick(HAPPY_IDLE_SPRITES, HAPPY_IDLE_SPRITE_N);
  idleText = pick(IDLE_TEXTS, IDLE_TEXT_N);
} else if (tier == 2) {
  idleSprite = pick(IDLE_SPRITES, IDLE_SPRITE_N);
  idleText = pick(IDLE_TEXTS, IDLE_TEXT_N);
} else if (tier == 1) {
  idleSprite = pick(GRUMPY_IDLE_SPRITES, GRUMPY_IDLE_SPRITE_N);
  idleText = pick(IDLE_TEXTS, IDLE_TEXT_N);
} else {
  idleSprite = pick(SAD_IDLE_SPRITES, SAD_IDLE_SPRITE_N);
  idleText = pick(SAD_TEXTS, SAD_TEXT_N);
}
showSprite(idleSprite, idleText);
```

- [ ] **Step 5: Commit**

```bash
git add device/src/main.cpp
git commit -m "feat(device): mood-filtered idle sprites + new text pools"
```

---

### Task 5: Implement Feed Action

**Files:**
- Modify: `device/src/main.cpp` (BtnA short press handler from Task 3)

- [ ] **Step 1: Implement feed in BtnA short press handler**

Replace the `// Feed action (Task 5)` comment in the BtnA release handler:
```cpp
if (happiness < 80) {
  changeHappiness(8, "feed");
  drawSprite(SPRITE_FEED_1);
  drawText(pick(FEED_TEXTS, FEED_TEXT_N));
  delay(600);
  drawSprite(SPRITE_FEED_2);
  drawText("Yum!");
  state = STATE_RESULT;
  stateTime = now;
}
```

- [ ] **Step 2: Commit**

```bash
git add device/src/main.cpp
git commit -m "feat(device): feed action on BtnA short press"
```

---

### Task 6: Implement Stats Overlay

**Files:**
- Modify: `device/src/main.cpp` (BtnB short press handler from Task 3)

- [ ] **Step 1: Add drawStatsOverlay function**

```cpp
static void drawStatsOverlay() {
  const char* moods[] = {"Sad", "Grumpy", "Content", "Happy"};
  int tier = getMoodTier();

  // Draw happiness bar in text area
  int barY = LAYOUT_TXT_Y + 4;
  int barW = (int)(happiness * 1.15f);  // scale 0-100 to 0-115px
  int barX = (SCREEN_W - 115) / 2;

  StickCP2.Display.fillRect(0, LAYOUT_TXT_Y, SCREEN_W, LAYOUT_TXT_H, COLOR_BG);
  // Bar background
  StickCP2.Display.drawRect(barX - 1, barY - 1, 117, 12, COLOR_FACE);
  // Bar fill — green when happy, yellow when content, orange when grumpy, red when sad
  uint16_t barColor = tier == 3 ? 0x07E0 : tier == 2 ? 0xFFE0 : tier == 1 ? 0xFD20 : 0xF800;
  StickCP2.Display.fillRect(barX, barY, barW, 10, barColor);
  // Mood label
  StickCP2.Display.setTextColor(COLOR_FACE, COLOR_BG);
  StickCP2.Display.setTextDatum(BC_DATUM);
  StickCP2.Display.drawString(moods[tier], SCREEN_W / 2, LAYOUT_TXT_Y + LAYOUT_TXT_H - 2, 2);
}
```

- [ ] **Step 2: Wire into BtnB short press**

Replace `// Short press: show stats (Task 6)` in BtnB release handler:
```cpp
drawStatsOverlay();
state = STATE_RESULT;
stateTime = now;
```

- [ ] **Step 3: Commit**

```bash
git add device/src/main.cpp
git commit -m "feat(device): stats overlay on BtnB short press"
```

---

### Task 7: Hook Happiness into Tap/Toss/Catch/Lost

**Files:**
- Modify: `device/src/main.cpp` (tap reaction ~line 886, catch ~line 677, lost ~line 688)

- [ ] **Step 1: Add happiness change to tap reaction**

In the tap detection reaction (~line 886), add after existing sprite/text/BLE:
```cpp
changeHappiness(-5, "tap");
```

- [ ] **Step 2: Add happiness change to catch reaction**

In the toss catch handler (~line 684), add:
```cpp
changeHappiness(10, "catch");
```

- [ ] **Step 3: Add happiness change to lost reaction**

In the toss lost handler (~line 690), add:
```cpp
changeHappiness(-15, "lost");
```

- [ ] **Step 4: Commit**

```bash
git add device/src/main.cpp
git commit -m "feat(device): happiness changes on tap/catch/lost"
```

---

### Task 8: Implement Petting Detection

**Files:**
- Modify: `device/src/main.cpp` (new detection function + hook into main loop)

- [ ] **Step 1: Add petting detection state variables**

```cpp
// ── Petting detection ──
static int rockCrossings = 0;
static bool rockPositive = false;
static unsigned long rockWindowStart = 0;
static unsigned long lastPetTime = 0;
#define PET_COOLDOWN_MS 30000
#define ROCK_WINDOW_MS 4000
#define ROCK_MIN_CROSSINGS 6  // 3 oscillations = 6 zero crossings
#define ROCK_MAG_MIN 0.2f
#define ROCK_MAG_MAX 0.6f
```

- [ ] **Step 2: Add detectPetting function**

```cpp
static bool detectPetting(float ax) {
  if (tossState != TOSS_IDLE) {
    rockCrossings = 0;
    return false;
  }

  unsigned long now = millis();
  if (now - lastPetTime < PET_COOLDOWN_MS) return false;

  float mag = fabsf(ax);
  if (mag < ROCK_MAG_MIN || mag > ROCK_MAG_MAX) {
    rockCrossings = 0;
    return false;
  }

  bool nowPositive = ax > 0;
  if (nowPositive != rockPositive) {
    rockPositive = nowPositive;
    if (rockCrossings == 0) rockWindowStart = now;
    rockCrossings++;

    if (now - rockWindowStart > ROCK_WINDOW_MS) {
      rockCrossings = 1;
      rockWindowStart = now;
    }

    if (rockCrossings >= ROCK_MIN_CROSSINGS) {
      rockCrossings = 0;
      lastPetTime = now;
      return true;
    }
  }
  return false;
}
```

- [ ] **Step 3: Hook into main loop**

In STATE_READY, after tilt detection and before tap detection (~line 882):
```cpp
if (tossState == TOSS_IDLE && detectPetting(imuAx)) {
  changeHappiness(3, "pet");
  showSprite(SPRITE_PET, pick(PET_TEXTS, PET_TEXT_N));
  state = STATE_RESULT;
  stateTime = now;
}
```

- [ ] **Step 4: Commit**

```bash
git add device/src/main.cpp
git commit -m "feat(device): petting detection via gentle rocking"
```

---

### Task 9: Build, Flash, and Verify

**Files:**
- Build: `device/` (PlatformIO project)

- [ ] **Step 1: Build firmware**

```bash
cd device
pio run
```
Expected: Successful compilation, binary size under 5.8MB

- [ ] **Step 2: Flash to device**

```bash
cd device
pio run --target upload
```
Expected: Upload success via USB serial

- [ ] **Step 3: Verify on device**

Manual verification checklist:
- Boot: Cece wakes with existing animation
- BtnA short press: Feed animation plays, happiness goes up
- BtnA long press: BLE toggles on/off with sprite
- BtnB short press: Stats bar shows with mood label
- BtnB long press: Debug screen appears
- Tap: Annoyed reaction (existing + happiness -5)
- Toss + catch: Celebration (existing + happiness +10)
- Tilt left/right/up: Tilt sprites still work
- Idle: Sprites reflect mood tier
- Gentle rocking: Pet sprite + text appears

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix(device): tomagotchi integration fixes"
```
