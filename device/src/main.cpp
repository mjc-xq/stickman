#include <M5StickCPlus2.h>
#include <utility/imu/MPU6886_Class.hpp>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <BleKeyboard.h>
#include <nvs_flash.h>
#include "sprites.h"

// ── WiFi ─────────────────────────────────────────────────────────────
#define WIFI_SSID "Flapjack"
#define WIFI_PASS "8313259154"

// ── Ably ─────────────────────────────────────────────────────────────
#define ABLY_KEY "9X6hPw.YFBkcQ:vRU9-1-MuwTSteM4YXv5cnmtByZpNHlyvMvoL-xdy0c"
#define ABLY_CHANNEL "stickman"

// ── IMU Axis Convention (verified via /calibrate) ────────────────────
// M5StickC Plus 2, portrait, USB at bottom:
//   +X = LEFT edge     (tilt right → ax ≈ -1)
//   +Y = toward TOP    (standing upright → ay ≈ +1)
//   +Z = out of screen (flat, screen up → az ≈ +1)
//
// Accelerometer reads REACTION force (axis pointing UP = +1g):
//   Flat on back, screen up:     ax≈0   ay≈0   az≈+1
//   Standing portrait, USB down: ax≈0   ay≈+1  az≈0
//   Tilted right (right edge down): ax≈-1  ay≈0  az≈0
//
// 3D viz mapping (device → Three.js):
//   -devX → threeX (negate!),  devZ → threeY (up),  devY → threeZ

// ── Colors ───────────────────────────────────────────────────────────
#define COLOR_BG    0xF79E
#define COLOR_FACE  0x4228
#define COLOR_INNER 0x6328

// ── Screen Layout (135×240) ────────────────────────────────────────
#define LAYOUT_TITLE_Y  0
#define LAYOUT_TITLE_H  20    // 0–19
#define LAYOUT_GFX_Y    20
#define LAYOUT_GFX_H    180   // 20–199
#define LAYOUT_TEXT_Y    200
#define LAYOUT_TEXT_H    40    // 200–239
#define LAYOUT_LINE2_Y   220

// ── App Modes ────────────────────────────────────────────────────────
// BtnB: toggle debug screen. BtnA: cycle BLE mode / toggle wand mount
enum AppMode { MODE_ACTIVE, MODE_DEBUG };
// bleMode: 0=off, 1=on (BLE tap select + tilt arrows)
static uint8_t bleMode = 0;
static bool wandMount = false;    // device mounted screen-down on wand — inverts Y/Z axes


// ── Gesture ──────────────────────────────────────────────────────────
// Single gesture: wand tap (sharp flick in any direction)

// ── Toss / App States ────────────────────────────────────────────────
enum TossState { TOSS_IDLE, TOSS_LAUNCHED, TOSS_FREEFALL, TOSS_CAUGHT };
enum AppState  { STATE_READY, STATE_RESULT, STATE_SLEEPING };

static AppMode mode = MODE_ACTIVE;
static AppState state = STATE_READY;
static unsigned long resultTime = 0;

// ── Happiness (tomagotchi) ───────────────────────────────────────────
static uint8_t happiness = 75;  // start happy!
static uint32_t lastHappinessTs = 0;  // unix timestamp of last happiness update
static bool ntpSynced = false;
static bool ntpDecayApplied = false;

// ── Idle face animation ──────────────────────────────────────────────
static unsigned long lastBlink = 0;
static unsigned long blinkInterval = 4000;

// ── Power Management ─────────────────────────────────────────────────
static unsigned long lastButtonPress = 0;
static unsigned long lastMotionTime = 0;
static const unsigned long MOTION_SLEEP_MS = 300000;  // 5 min no motion
static const unsigned long BUTTON_SLEEP_MS = 600000;  // 10 min no button

// ── IMU ──────────────────────────────────────────────────────────────
static m5::MPU6886_Class* mpu = nullptr;
static float imuAx, imuAy, imuAz, imuGx, imuGy, imuGz;

// [C8 FIX] Returns false on I2C read failure — caller should skip processing
static bool readIMUFull() {
  uint8_t buf[14];
  if (!mpu->readRegister(m5::MPU6886_Class::REG_ACCEL_XOUT_H, buf, 14)) {
    return false; // I2C error — keep previous values
  }
  imuAx = (int16_t)((buf[0] << 8) | buf[1]) * (8.0f / 32768.0f);
  imuAy = (int16_t)((buf[2] << 8) | buf[3]) * (8.0f / 32768.0f);
  imuAz = (int16_t)((buf[4] << 8) | buf[5]) * (8.0f / 32768.0f);
  imuGx = (int16_t)((buf[8] << 8) | buf[9]) * (2000.0f / 32768.0f);
  imuGy = (int16_t)((buf[10] << 8) | buf[11]) * (2000.0f / 32768.0f);
  imuGz = (int16_t)((buf[12] << 8) | buf[13]) * (2000.0f / 32768.0f);
  // Wand mount: device is flipped screen-down (180° around Y axis)
  // Left/right mirror + screen normal inverts
  if (wandMount) {
    imuAx = -imuAx; imuAz = -imuAz;
    imuGx = -imuGx; imuGz = -imuGz;
  }
  return true;
}

// ── Tap Detection State ──────────────────────────────────────────────
// High-pass filtered jerk detection with duration gate.
// Layer 1: IIR high-pass filter removes gravity + tilt (cutoff ~4Hz)
// Layer 2: Jerk (derivative) of filtered magnitude — taps produce huge jerk
// Layer 3: Duration gate — tap energy dissipates within 50ms, tilts don't
#define TAP_HP_ALPHA       0.8f   // high-pass filter coefficient (0.8 → ~4Hz cutoff at 100Hz)
#define TAP_JERK_THRESH    0.6f   // minimum jerk to trigger candidate (g/sample)
#define TAP_HP_MAG_THRESH  0.4f   // minimum HP-filtered magnitude at trigger (g)
#define TAP_SETTLE_WINDOW  5      // samples to wait for energy to dissipate
#define TAP_SETTLE_THRESH  0.15f  // HP magnitude must drop below this to confirm tap
#define TAP_COOLDOWN_MS    500    // cooldown after confirmed tap (ms)

// High-pass filter state (per-axis)
static float hpPrevRaw[3] = {0, 0, 0};  // previous raw accel values
static float hpState[3]   = {0, 0, 0};  // filter output state

// Detection state
static float prevHpMag = 0;
static unsigned long lastTapTime = 0;
static int tapSettleCount = -1;  // -1 = no candidate, 0..N = counting settle samples

// ── Toss State ───────────────────────────────────────────────────────
static TossState tossState = TOSS_IDLE;
static unsigned long freefallStart = 0, tossResultTime = 0, launchTime = 0;
static float launchAccPeak = 0;
static int freefallSamples = 0;

// ── Motion (power mgmt) ─────────────────────────────────────────────
static float motionAccum = 0;
static int motionSamples = 0;
static unsigned long lastMotionCheck = 0;

// ── Ably WebSocket ───────────────────────────────────────────────────
static WebSocketsClient webSocket;
enum AblyState { ABLY_DISCONNECTED, ABLY_CONNECTED, ABLY_ATTACHED };
static AblyState ablyState = ABLY_DISCONNECTED;
static unsigned long lastAblyPublish = 0;
static unsigned long ablyMsgCount = 0, ablyMsgCountStart = 0;
static float ablyRate = 0;
static unsigned long ablyMsgSerial = 0;
static float prevPitch = 0, prevRoll = 0;
static float prevSentAx = 0, prevSentAy = 0, prevSentAz = 0;

// ── BLE Keyboard (Apple TV compatible) ───────────────────────────────
// tvOS fully supports BLE HID keyboards for navigation.
// Arrow keys = navigate, Return = select/enter, Escape = back/menu.
#define BLE_DEVICE_NAME "Chaos Wand"
#define BLE_PRESS_MS 80

static BleKeyboard bleKb(BLE_DEVICE_NAME, "Stickman", 100);
static bool bleEnabled = false;  // controls whether keys are sent (BLE stack always runs)
static unsigned long blePressTime = 0;
static uint8_t blePressedKey = 0;

// ── Tilt-to-arrows tuning ──
#define JOY_TILT_THRESH 0.20f     // tilt (g) to trigger arrow — ~12 degrees
#define JOY_REPEAT_MS 180         // arrow key repeat rate (ms)
#define JOY_SEND_INTERVAL_MS 25
static unsigned long lastJoySend = 0;
static unsigned long lastArrowTime[4] = {0,0,0,0};
static bool arrowHeld[4] = {false,false,false,false};

static uint8_t nvsReadBleMode() {
  nvs_handle_t h;
  uint8_t val = 1;  // default: on
  if (nvs_open("stickman", NVS_READONLY, &h) == ESP_OK) {
    if (nvs_get_u8(h, "ble_mode", &val) != ESP_OK) val = 1;
    nvs_close(h);
  }
  return val > 1 ? 1 : val;
}

static void nvsWriteBleMode(uint8_t mode) {
  nvs_handle_t h;
  if (nvs_open("stickman", NVS_READWRITE, &h) == ESP_OK) {
    nvs_set_u8(h, "ble_mode", mode);
    nvs_commit(h);
    nvs_close(h);
  }
}

static bool nvsReadWandMount() {
  nvs_handle_t h;
  uint8_t val = 0;
  if (nvs_open("stickman", NVS_READONLY, &h) == ESP_OK) {
    nvs_get_u8(h, "wand_mt", &val);
    nvs_close(h);
  }
  return val != 0;
}

static void nvsWriteWandMount(bool on) {
  nvs_handle_t h;
  if (nvs_open("stickman", NVS_READWRITE, &h) == ESP_OK) {
    nvs_set_u8(h, "wand_mt", on ? 1 : 0);
    nvs_commit(h);
    nvs_close(h);
  }
}

// ── NVS: Happiness ──
static uint8_t nvsReadHappiness() {
  nvs_handle_t h;
  uint8_t val = 75;
  if (nvs_open("stickman", NVS_READONLY, &h) == ESP_OK) {
    nvs_get_u8(h, "happiness", &val);
    nvs_close(h);
  }
  return val > 100 ? 75 : val;
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

static void applyBleMode() {
  bleEnabled = bleMode > 0;
  for (int i = 0; i < 4; i++) arrowHeld[i] = false;
}

static void bleInit() {
  nvs_flash_init();
  bleMode = nvsReadBleMode();
  bleEnabled = bleMode > 0;
  bleKb.begin();  // always start BLE — keeps Apple TV connection stable
  Serial.printf("BLE: %s '" BLE_DEVICE_NAME "'\n", bleEnabled ? "ON" : "OFF");
}


static const char* bleStatusStr() {
  if (bleKb.isConnected()) return bleEnabled ? "CONNECTED" : "IDLE";
  return "PAIRING";
}

static void bleSendKey(uint8_t key) {
  if (!bleEnabled || !bleKb.isConnected()) return;
  bleKb.press(key);
  blePressedKey = key;
  blePressTime = millis();
}

static void bleUpdate() {
  if (blePressTime > 0) {
    if (!bleKb.isConnected()) { blePressTime = 0; blePressedKey = 0; return; }
    if (millis() - blePressTime >= BLE_PRESS_MS) {
      bleKb.release(blePressedKey);
      blePressTime = 0; blePressedKey = 0;
    }
  }
}

// Tilt → arrow keys for Apple TV navigation
static void bleSendArrows() {
  if (!bleEnabled || !bleKb.isConnected()) return;
  unsigned long now = millis();

  // Device: +X=left, +Y=top
  bool wantLeft  = imuAx > JOY_TILT_THRESH;
  bool wantRight = imuAx < -JOY_TILT_THRESH;
  bool wantUp    = imuAy > JOY_TILT_THRESH;
  bool wantDown  = imuAy < -JOY_TILT_THRESH;

  const uint8_t keys[4] = {KEY_LEFT_ARROW, KEY_RIGHT_ARROW, KEY_UP_ARROW, KEY_DOWN_ARROW};
  const bool wants[4] = {wantLeft, wantRight, wantUp, wantDown};

  for (int i = 0; i < 4; i++) {
    if (wants[i]) {
      if (!arrowHeld[i] || (now - lastArrowTime[i] >= JOY_REPEAT_MS)) {
        bleKb.press(keys[i]);
        bleKb.release(keys[i]);
        lastArrowTime[i] = now;
        arrowHeld[i] = true;
      }
    } else {
      arrowHeld[i] = false;
    }
  }
}

// ── Debug ────────────────────────────────────────────────────────────
static unsigned long lastDebugDraw = 0;

// ── Ably ─────────────────────────────────────────────────────────────

static void ablyAttach() {
  char attach[128];
  snprintf(attach, sizeof(attach), "{\"action\":10,\"channel\":\"%s\"}", ABLY_CHANNEL);
  webSocket.sendTXT(attach);
}

static void ablyEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: Serial.println("Ably: WS connected"); break;
    case WStype_TEXT: {
      char* text = (char*)payload;
      int action = -1;
      const char* ap = strstr(text, "\"action\":");
      if (ap) action = atoi(ap + 9);
      if (action == 4) {
        Serial.println("Ably: CONNECTED");
        ablyMsgSerial = 0; ablyAttach(); ablyState = ABLY_CONNECTED;
      } else if (action == 11) {
        Serial.printf("Ably: ATTACHED to %s\n", ABLY_CHANNEL);
        ablyState = ABLY_ATTACHED; ablyMsgCount = 0; ablyMsgCountStart = millis();
      } else if (action == 2) {
        Serial.printf("Ably NACK: %.*s\n", (int)fminf(length, 100), text);
      } else if (action == 13 || action == 9) {
        Serial.printf("Ably ERR: %.*s\n", (int)fminf(length, 120), text);
        ablyState = ABLY_CONNECTED; ablyAttach();
      }
      break;
    }
    case WStype_DISCONNECTED:
      Serial.println("Ably: disconnected");
      ablyState = ABLY_DISCONNECTED;
      prevPitch = 0; prevRoll = 0;
      prevSentAx = 0; prevSentAy = 0; prevSentAz = 0;
      break;
    default: break;
  }
}

static void publishEvent(const char* name, const char* data) {
  if (ablyState != ABLY_ATTACHED) return;
  char msg[384];
  snprintf(msg, sizeof(msg),
    "{\"action\":15,\"channel\":\"%s\",\"msgSerial\":%lu,\"messages\":[{\"name\":\"%s\",\"data\":\"%s\"}]}",
    ABLY_CHANNEL, ablyMsgSerial++, name, data);
  webSocket.sendTXT(msg);
}

static void publishIMU() {
  if (ablyState != ABLY_ATTACHED) return;
  unsigned long now = millis();
  if (now - lastAblyPublish < 50) return; // 20Hz max for responsive tracking
  float pitch = atan2f(imuAx, sqrtf(imuAy*imuAy + imuAz*imuAz)) * 57.2958f;
  float roll  = atan2f(imuAy, sqrtf(imuAx*imuAx + imuAz*imuAz)) * 57.2958f;
  bool changed = fabsf(pitch - prevPitch) >= 2.0f || fabsf(roll - prevRoll) >= 2.0f
              || fabsf(imuAx - prevSentAx) >= 0.05f || fabsf(imuAy - prevSentAy) >= 0.05f
              || fabsf(imuAz - prevSentAz) >= 0.05f;
  if (!changed) return;
  prevPitch = pitch; prevRoll = roll;
  prevSentAx = imuAx; prevSentAy = imuAy; prevSentAz = imuAz;
  lastAblyPublish = now;
  char data[160];
  snprintf(data, sizeof(data),
    "{\\\"ax\\\":%.3f,\\\"ay\\\":%.3f,\\\"az\\\":%.3f,"
    "\\\"gx\\\":%.1f,\\\"gy\\\":%.1f,\\\"gz\\\":%.1f,"
    "\\\"p\\\":%.1f,\\\"r\\\":%.1f,\\\"t\\\":%lu}",
    imuAx, imuAy, imuAz, imuGx, imuGy, imuGz, pitch, roll, now);
  char msg[384];
  snprintf(msg, sizeof(msg),
    "{\"action\":15,\"channel\":\"%s\",\"msgSerial\":%lu,\"messages\":[{\"name\":\"imu\",\"data\":\"%s\"}]}",
    ABLY_CHANNEL, ablyMsgSerial++, data);
  webSocket.sendTXT(msg);
  ablyMsgCount++;
  if (now - ablyMsgCountStart >= 1000) {
    ablyRate = ablyMsgCount * 1000.0f / (now - ablyMsgCountStart);
    ablyMsgCount = 0; ablyMsgCountStart = now;
  }
}

static void drawModeIndicator(const char* label = nullptr);
static void publishEvent(const char* name, const char* data);

// ── Happiness helpers ────────────────────────────────────────────────

static int getMoodTier() {
  if (happiness >= 70) return 3;  // happy
  if (happiness >= 40) return 2;  // content
  if (happiness >= 15) return 1;  // sassy/bored (not sad)
  return 0;                       // sad (very rare)
}

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

  const char* mood = happiness >= 80 ? "happy" : happiness >= 50 ? "content" : happiness >= 20 ? "grumpy" : "sad";
  char buf[96];
  snprintf(buf, sizeof(buf), "{\\\"value\\\":%d,\\\"mood\\\":\\\"%s\\\",\\\"cause\\\":\\\"%s\\\"}", happiness, mood, cause);
  publishEvent("happiness", buf);
}

// ── Petting detection ────────────────────────────────────────────────
static int rockCrossings = 0;
static bool rockPositive = false;
static unsigned long rockWindowStart = 0;
static unsigned long lastPetTime = 0;
#define PET_COOLDOWN_MS 30000
#define ROCK_WINDOW_MS 4000
#define ROCK_MIN_CROSSINGS 6  // 3 oscillations = 6 zero crossings
#define ROCK_MAG_MIN 0.2f
#define ROCK_MAG_MAX 0.6f

// ── Sprite Drawing ───────────────────────────────────────────────────

static SpriteIdx currentSprite = SPRITE_IDLE_STANDING;
static unsigned long lastRandomSpriteChange = 0;
static unsigned long lastAnimSwap = 0;  // 2-frame animation cycling
static int8_t prevTilt = 0;             // tilt detection state (0=neutral, 1=left, 2=right, 3=up)
static unsigned long lastTiltChange = 0; // cooldown for tilt sprite changes
#define TILT_CHANGE_MS 800               // minimum ms between tilt sprite changes

static SpriteIdx pick(const SpriteIdx* list, int n) { return list[random(n)]; }
static const char* pick(const char* const* list, int n) { return list[random(n)]; }

// ── Sprite + text pools for every context ────────────────────────────

static const SpriteIdx IDLE_SPRITES[] = {
  SPRITE_IDLE_STANDING, SPRITE_IDLE_WAND_TWIRL,
  SPRITE_IDLE_HUMMING_1, SPRITE_IDLE_HUMMING_2,
  SPRITE_IDLE_HAT_ADJUST,
  SPRITE_IDLE_LOOKING_LEFT, SPRITE_IDLE_LOOKING_RIGHT,
  SPRITE_IDLE_SITTING, SPRITE_IDLE_GLASSES_PUSH,
  SPRITE_IDLE_SPELL_PRACTICE, SPRITE_IDLE_YAWN, SPRITE_IDLE_WAVE
};
#define IDLE_SPRITE_N 12

static const char* const IDLE_TEXTS[] = {
  "La la la~", "Hmm hmm~", "Hi!", "*vibes*", "Hehe", ":)",
  "Comfy~", "Nice day!", "*hums*", "Oh hey!", "Teehee",
  "Sup!", "Boop!", "*wiggles*", "*sparkle*", "Yay~", "Heehee~",
  "Abracadabra!", "*whistles*", "Do do do~", "Wingardium~"
};
#define IDLE_TEXT_N 21

static const SpriteIdx TILT_LEFT_SPRITES[] = {
  SPRITE_TILT_LEFT, SPRITE_TILT_LEFT_2, SPRITE_TILT_LEFT_3,
  SPRITE_TILT_HUEY_LEFT, SPRITE_TILT_ALEX_LEFT
};
#define TILT_LEFT_SPRITE_N 5

static const SpriteIdx TILT_RIGHT_SPRITES[] = {
  SPRITE_TILT_RIGHT, SPRITE_TILT_RIGHT_2, SPRITE_TILT_RIGHT_3,
  SPRITE_TILT_HUEY_RIGHT, SPRITE_TILT_ALEX_RIGHT
};
#define TILT_RIGHT_SPRITE_N 5

static const SpriteIdx TILT_UP_SPRITES[] = {
  SPRITE_TILT_UP, SPRITE_TILT_UP_2, SPRITE_TILT_UP_3
};
#define TILT_UP_SPRITE_N 3

static const char* const TILT_TEXTS[] = {
  "Whoa!", "Ooh!", "Wobbly!", "Careful!", "Eep!", "Tipping!",
  "Whee!", "Steady!", "I'm sliding!", "Hold me!", "Ahh!", "Leaning!",
  "Off balance!", "Not again!", "Woaaah!", "Help!", "Dizzy!"
};
#define TILT_TEXT_N 17

static const char* const TILT_UP_TEXTS[] = {
  "Upside down!", "Wrong way!", "The world!", "Ahhhh!", "Whoa whoa!",
  "My glasses!", "Blood rush!", "Flip me!", "Dizzy...", "Nooo!"
};
#define TILT_UP_TEXT_N 10

static const SpriteIdx TAP_SPRITES[] = {
  SPRITE_TAP_ANNOYED, SPRITE_TAP_ANGRY,
  SPRITE_TAP_SHOCKED, SPRITE_TAP_DIZZY, SPRITE_TAP_CRY,
  SPRITE_TAP_GLARE, SPRITE_TAP_DODGE, SPRITE_TAP_REVENGE
};
#define TAP_SPRITE_N 8

static const char* const TAP_TEXTS[] = {
  "Oww!", "Hey!", "Oof!", "Rude!", "Bonk!", "Ouch!",
  "Ack!", "Stop it!", "Meanie!", "Bap!", "Not cool!", "Eeek!",
  "Excuse me?!", "*bonk*", "Why?!", "So mean!", "Quit it!",
  "My hat!", "Grr!", "Watch it!"
};
#define TAP_TEXT_N 20

static const SpriteIdx TOSS_AIR_SPRITES[] = {
  SPRITE_TOSS_AIR_1, SPRITE_TOSS_AIR_2
};
#define TOSS_AIR_SPRITE_N 2

static const char* const TOSS_AIR_TEXTS[] = {
  "AAAH!", "Wheeee!", "Flying!", "I'm up!", "Woooo!",
  "So high!", "Weee!", "Oh wow!", "Airborne!"
};
#define TOSS_AIR_N 9

static const SpriteIdx CATCH_HIGH_SPRITES[] = {
  SPRITE_CATCH_HIGH, SPRITE_CATCH_HIGH_ALT
};
#define CATCH_HIGH_SPRITE_N 2

static const char* const TOSS_CATCH_HIGH_TEXTS[] = {
  "Wooow!", "Epic!", "Sky high!", "Insane!", "Unreal!", "LEGENDARY!"
};
#define TOSS_CATCH_HIGH_TEXT_N 6

static const SpriteIdx CATCH_MED_SPRITES[] = {
  SPRITE_CATCH_MED, SPRITE_CATCH_MED_ALT
};
#define CATCH_MED_SPRITE_N 2

static const char* const TOSS_CATCH_MED_TEXTS[] = {
  "So fun!", "Nice one!", "Great!", "Awesome!", "Woohoo!", "Sweet!"
};
#define TOSS_CATCH_MED_TEXT_N 6

static const SpriteIdx CATCH_LOW_SPRITES[] = {
  SPRITE_CATCH_LOW, SPRITE_CATCH_LOW_ALT
};
#define CATCH_LOW_SPRITE_N 2

static const char* const TOSS_CATCH_LOW_TEXTS[] = {
  "Yay!", "Hehe!", "Caught!", "Whew!", "Got me!", "Safe!"
};
#define TOSS_CATCH_LOW_TEXT_N 6

static const SpriteIdx TOSS_LOST_SPRITES[] = {
  SPRITE_TOSS_LOST_1, SPRITE_TOSS_LOST_2
};
#define TOSS_LOST_SPRITE_N 2

static const char* const TOSS_LOST_TEXTS[] = {
  "Oh no!", "Where am", "I?!", "*crying*", "Come back!", "Help!"
};
#define TOSS_LOST_N 6

static const SpriteIdx BLE_ON_SPRITES[] = {
  SPRITE_BLE_ON, SPRITE_BLE_ON_ALT
};
#define BLE_ON_SPRITE_N 2

static const char* const BLE_ON_TEXTS[] = {
  "BLE On!", "Zap!", "Connected!", "Magic link!", "Spell cast!"
};
#define BLE_ON_TEXT_N 5

static const SpriteIdx BLE_OFF_SPRITES[] = {
  SPRITE_BLE_OFF, SPRITE_BLE_OFF_ALT
};
#define BLE_OFF_SPRITE_N 2

static const char* const BLE_OFF_TEXTS[] = {
  "BLE Off!", "Unplugged~", "Going dark", "Sleepy...", "Offline~"
};
#define BLE_OFF_TEXT_N 5

// ── Feed sprites + texts ──
// Eating poses first (indices 0-3), then done/satisfied poses (4-5)
static const SpriteIdx FEED_SPRITES[] = {
  SPRITE_FEED_1, SPRITE_FEED_2, SPRITE_FEED_3, SPRITE_FEED_SHRIMP,  // eating
  SPRITE_FEED_4, SPRITE_FEED_5                                       // done (chipmunk cheeks, belly rub)
};
#define FEED_SPRITE_N 6
#define FEED_EAT_N 4   // first 4 are eating poses
#define FEED_DONE_START 4  // done poses start at index 4

static const char* const FEED_TEXTS[] = {
  "Yum!", "Nom nom!", "Tasty~", "More leaves!", "*munch munch*", "So good!"
};
#define FEED_TEXT_N 6

// ── Pet texts ──
static const char* const PET_TEXTS[] = {
  "Mmmm...", "That's nice~", "Cozy...", "*purrs*", "More please!"
};
#define PET_TEXT_N 5

// ── Bored/sassy texts (grumpy tier — spunky not sad) ──
static const char* const SASSY_TEXTS[] = {
  "Hmph!", "I'm bored~", "Play with me!", "Ahem!", "*taps foot*",
  "Excuse me?!", "Helloooo?", "Pay attention!", "I'm waiting...", "Boo!"
};
#define SASSY_TEXT_N 10

// ── Hungry/needy texts (rare, still fun) ──
static const char* const SAD_TEXTS[] = {
  "So hungry!", "Feed me!", "Snack time?", "*tummy growl*", "Need food!",
  "Starving~", "Got snacks?", "Pizza plz!", "Hangry!"
};
#define SAD_TEXT_N 9

// ── Mood-filtered idle sprite pools ──
static const SpriteIdx HAPPY_IDLE_SPRITES[] = {
  SPRITE_IDLE_WAVE, SPRITE_IDLE_HUMMING_1, SPRITE_IDLE_HUMMING_2,
  SPRITE_IDLE_SPELL_PRACTICE, SPRITE_IDLE_WAND_TWIRL,
  SPRITE_IDLE_STANDING, SPRITE_IDLE_HAT_ADJUST, SPRITE_IDLE_GLASSES_PUSH
};
#define HAPPY_IDLE_SPRITE_N 8

// Grumpy = sassy/bored, NOT sad. Uses active looking-around sprites, not tired ones.
static const SpriteIdx GRUMPY_IDLE_SPRITES[] = {
  SPRITE_IDLE_LOOKING_LEFT, SPRITE_IDLE_LOOKING_RIGHT,
  SPRITE_IDLE_GLASSES_PUSH, SPRITE_IDLE_HAT_ADJUST,
  SPRITE_IDLE_STANDING
};
#define GRUMPY_IDLE_SPRITE_N 5

static const SpriteIdx SAD_IDLE_SPRITES[] = {
  SPRITE_SAD_1, SPRITE_SAD_2, SPRITE_IDLE_YAWN
};
#define SAD_IDLE_SPRITE_N 3

// ── Companion sprites (bonus idle pool) ──
static const SpriteIdx COMPANION_SPRITES[] = {
  SPRITE_HUEY_CUDDLE, SPRITE_HUEY_NAP, SPRITE_HUEY_PLAY, SPRITE_HUEY_LICK,
  SPRITE_HUEY_WALK, SPRITE_HUEY_TREAT, SPRITE_HUEY_COUCH,
  SPRITE_ALEX_SPELL, SPRITE_ALEX_TEACH, SPRITE_ALEX_HIGH_FIVE,
  SPRITE_ALEX_WAND_COMPARE, SPRITE_ALEX_LAUGH, SPRITE_ALEX_SELFIE
};
#define COMPANION_SPRITE_N 13

// ── Motivational texts (shown periodically in happy/content tiers) ──
static const char* const MOTIV_TEXTS[] = {
  "Your dad loves u!", "You are AMAZING!", "You're so smart!",
  "Be kind today~", "You can do it!", "Believe in you!",
  "You're a star!", "Dream big!", "You are enough!",
  "So proud of you!", "You're magic!", "Stay curious!",
  "You're beautiful!", "Never give up!", "You rock!",
  "Love yourself~", "You matter!", "Shine bright!",
  "Dad is proud!", "You're the best!"
};
#define MOTIV_TEXT_N 20

static void drawSprite(SpriteIdx sprite) {
  currentSprite = sprite;
  const uint16_t* data = (const uint16_t*)pgm_read_ptr(&SPRITE_DATA[sprite]);
  // Swap bytes: our RGB565 is standard byte order, ST7789 wants big-endian
  StickCP2.Display.setSwapBytes(true);
  StickCP2.Display.pushImage(0, LAYOUT_GFX_Y, SPRITE_W, SPRITE_H, data);
  StickCP2.Display.setSwapBytes(false);
  drawModeIndicator();
}

static void clearTextArea() { StickCP2.Display.fillRect(0, LAYOUT_TEXT_Y, 135, LAYOUT_TEXT_H, COLOR_BG); }

static void showMessage(const char* l1, const char* l2 = nullptr) {
  clearTextArea();
  StickCP2.Display.setTextColor(COLOR_FACE, COLOR_BG);
  StickCP2.Display.setTextDatum(TC_DATUM);
  if (l2) {
    StickCP2.Display.drawString(l1, 67, LAYOUT_TEXT_Y, 2);
    StickCP2.Display.drawString(l2, 67, LAYOUT_LINE2_Y, 2);
  } else {
    StickCP2.Display.drawString(l1, 67, LAYOUT_TEXT_Y + (LAYOUT_TEXT_H - 26) / 2, 4);
  }
}

static void showSprite(SpriteIdx sprite, const char* m1, const char* m2 = nullptr) {
  drawSprite(sprite); showMessage(m1, m2);
}

static void drawModeIndicator(const char* label) {
  StickCP2.Display.fillRect(0, LAYOUT_TITLE_Y, 135, LAYOUT_TITLE_H, COLOR_INNER);
  StickCP2.Display.setTextColor(COLOR_BG, COLOR_INNER);
  StickCP2.Display.setTextDatum(TC_DATUM);
  if (label) {
    StickCP2.Display.drawString(label, 67, 2, 2);
  } else if (mode == MODE_DEBUG) {
    StickCP2.Display.drawString("# Debug #", 67, 2, 2);
  } else {
    const char* labels[] = {"~ Cece ~", "~ Remote ~"};
    StickCP2.Display.drawString(labels[bleMode], 67, 2, 2);
  }
  if (bleMode == 1) StickCP2.Display.fillCircle(125, 8, 4, BLUE);
}

// ── Debug Screen ─────────────────────────────────────────────────────

static void drawDebugScreen() {
  StickCP2.Display.fillScreen(BLACK);
  drawModeIndicator();
  StickCP2.Display.setTextDatum(TL_DATUM);
  int y = 24, lh = 22;
  bool wifiOk = WiFi.isConnected();
  StickCP2.Display.setTextColor(wifiOk ? GREEN : RED, BLACK);
  StickCP2.Display.drawString(wifiOk ? "WiFi: OK" : "WiFi: --", 4, y, 2); y += lh;
  if (wifiOk) {
    StickCP2.Display.setTextColor(CYAN, BLACK);
    char buf[32];
    snprintf(buf, sizeof(buf), "SSID: %s", WiFi.SSID().c_str());
    StickCP2.Display.drawString(buf, 4, y, 2); y += lh;
    int rssi = WiFi.RSSI();
    int bars = rssi > -50 ? 4 : rssi > -60 ? 3 : rssi > -70 ? 2 : rssi > -80 ? 1 : 0;
    snprintf(buf, sizeof(buf), "Sig: %ddBm %.*s", rssi, bars, "||||");
    StickCP2.Display.setTextColor(WHITE, BLACK);
    StickCP2.Display.drawString(buf, 4, y, 2); y += lh;
    snprintf(buf, sizeof(buf), "IP: %s", WiFi.localIP().toString().c_str());
    StickCP2.Display.drawString(buf, 4, y, 2); y += lh;
  } else { y += lh * 3; }
  int batPct = StickCP2.Power.getBatteryLevel();
  char buf[32];
  snprintf(buf, sizeof(buf), "Bat: %d%% %.2fV", batPct, StickCP2.Power.getBatteryVoltage() / 1000.0f);
  StickCP2.Display.setTextColor(batPct > 20 ? GREEN : RED, BLACK);
  StickCP2.Display.drawString(buf, 4, y, 2); y += lh;
  const char* as = ablyState == ABLY_ATTACHED ? "Ably: OK" : ablyState == ABLY_CONNECTED ? "Ably: Conn" : "Ably: --";
  StickCP2.Display.setTextColor(ablyState == ABLY_ATTACHED ? GREEN : ablyState == ABLY_CONNECTED ? YELLOW : RED, BLACK);
  StickCP2.Display.drawString(as, 4, y, 2); y += lh;
  if (ablyState == ABLY_ATTACHED) {
    snprintf(buf, sizeof(buf), "Rate: %.0f msg/s", ablyRate);
    StickCP2.Display.setTextColor(WHITE, BLACK);
    StickCP2.Display.drawString(buf, 4, y, 2); y += lh;
  }

  // BLE status
  bool bleCon = bleKb.isConnected();
  StickCP2.Display.setTextColor(bleCon ? GREEN : YELLOW, BLACK);
  snprintf(buf, sizeof(buf), "BLE: %s", bleStatusStr());
  StickCP2.Display.drawString(buf, 4, y, 2); y += lh;
  StickCP2.Display.setTextColor(CYAN, BLACK);
  StickCP2.Display.drawString(BLE_DEVICE_NAME, 4, y, 2); y += lh;
  // Wand mount toggle (BtnA in debug mode)
  StickCP2.Display.setTextColor(wandMount ? GREEN : WHITE, BLACK);
  snprintf(buf, sizeof(buf), "Mount: %s", wandMount ? "WAND" : "Normal");
  StickCP2.Display.drawString(buf, 4, y, 2);
}

// ── Tap Detection ────────────────────────────────────────────────────
// Uses high-pass filtered acceleration to isolate tap impulses from
// gravity/tilt, then checks jerk (derivative) and impulse brevity.
//
// Why this rejects tilts:
//   1. HP filter removes gravity rotation (DC) and slow tilt (<4Hz)
//   2. Jerk threshold requires rapid change — tilts are gradual
//   3. Duration gate requires energy to dissipate in <50ms — tilts are sustained

static bool detectTap(float rawAx, float rawAy, float rawAz) {
  unsigned long now = millis();
  float raw[3] = {rawAx, rawAy, rawAz};

  // Layer 1: Single-pole IIR high-pass filter on each axis
  // hp[n] = alpha * (hp[n-1] + raw[n] - raw[n-1])
  // Removes DC (gravity) and frequencies below ~4Hz (tilts)
  float hpAcc[3];
  for (int i = 0; i < 3; i++) {
    hpState[i] = TAP_HP_ALPHA * (hpState[i] + raw[i] - hpPrevRaw[i]);
    hpPrevRaw[i] = raw[i];
    hpAcc[i] = hpState[i];
  }

  // Filtered magnitude (gravity-free, tilt-free)
  float hpMag = sqrtf(hpAcc[0]*hpAcc[0] + hpAcc[1]*hpAcc[1] + hpAcc[2]*hpAcc[2]);

  // Layer 2: Jerk = magnitude change between consecutive filtered samples
  float jerk = hpMag - prevHpMag;
  prevHpMag = hpMag;

  // Layer 3: Duration gate — track settle after candidate trigger
  if (tapSettleCount >= 0) {
    tapSettleCount++;
    if (hpMag < TAP_SETTLE_THRESH) {
      // Energy dissipated quickly — confirmed tap
      int settled = tapSettleCount;
      tapSettleCount = -1;
      lastTapTime = now;
      Serial.printf("TAP! hpMag=%.2f settled@%d samples\n", hpMag, settled);
      return true;
    }
    if (tapSettleCount > TAP_SETTLE_WINDOW) {
      // Energy sustained too long — not a tap (it's a tilt or shake)
      tapSettleCount = -1;
      Serial.printf("TAP rejected: sustained motion (hpMag=%.2f)\n", hpMag);
      return false;
    }
    return false; // still waiting to settle
  }

  // Skip during cooldown or active toss
  if (now - lastTapTime < TAP_COOLDOWN_MS) return false;
  if (tossState != TOSS_IDLE) return false;

  // Trigger candidate: large positive jerk AND significant filtered magnitude
  if (jerk > TAP_JERK_THRESH && hpMag > TAP_HP_MAG_THRESH) {
    tapSettleCount = 0; // start duration gate
  }

  return false;
}

// ── Petting Detection (gentle rocking) ───────────────────────────────

static bool detectPetting(float ax) {
  if (tossState != TOSS_IDLE) { rockCrossings = 0; return false; }
  unsigned long now = millis();
  if (now - lastPetTime < PET_COOLDOWN_MS) return false;

  float mag = fabsf(ax);
  if (mag < ROCK_MAG_MIN || mag > ROCK_MAG_MAX) { rockCrossings = 0; return false; }

  bool nowPositive = ax > 0;
  if (nowPositive != rockPositive) {
    rockPositive = nowPositive;
    if (rockCrossings == 0) rockWindowStart = now;
    rockCrossings++;
    if (now - rockWindowStart > ROCK_WINDOW_MS) {
      rockCrossings = 1; rockWindowStart = now;
    }
    if (rockCrossings >= ROCK_MIN_CROSSINGS) {
      rockCrossings = 0; lastPetTime = now;
      return true;
    }
  }
  return false;
}

// ── Toss Detection (always active, runs alongside gestures) ──────────

static void updateToss(float accMag, unsigned long now) {
  switch (tossState) {
    case TOSS_IDLE:
      // Suppress toss if a tap was just detected (tap spikes can hit 3-4g)
      if (accMag > 2.5f && (now - lastTapTime > TAP_COOLDOWN_MS)) {
        launchAccPeak = accMag; launchTime = now;
        tossState = TOSS_LAUNCHED;
        drawSprite(SPRITE_TOSS_LAUNCH);
      }
      break;
    case TOSS_LAUNCHED:
      if (accMag > launchAccPeak) launchAccPeak = accMag;
      if (accMag < 0.4f) {
        tossState = TOSS_FREEFALL; freefallStart = now; freefallSamples = 0;
        showSprite(pick(TOSS_AIR_SPRITES, TOSS_AIR_SPRITE_N), pick(TOSS_AIR_TEXTS, TOSS_AIR_N));
        char ld[64];
        snprintf(ld, sizeof(ld), "{\\\"state\\\":\\\"airborne\\\",\\\"launchG\\\":%.1f}", launchAccPeak);
        publishEvent("toss", ld);
        state = STATE_RESULT; resultTime = now;
      } else if (now - launchTime > 200) { tossState = TOSS_IDLE; }
      break;
    case TOSS_FREEFALL:
      freefallSamples++;
      if (accMag < 0.6f) { /* falling */ }
      else if (accMag > 1.3f && freefallSamples >= 1) {
        tossState = TOSS_CAUGHT;
        float fs = (now - freefallStart) / 1000.0f;
        float hi = 0.5f * 9.81f * (fs/2.0f) * (fs/2.0f) * 39.37f;
        char hs[20];
        if (hi >= 12.0f) snprintf(hs, sizeof(hs), "%d'%d\"", (int)(hi/12), (int)(hi)%12);
        else snprintf(hs, sizeof(hs), "%.0f in", hi);
        if (hi > 48) showSprite(pick(CATCH_HIGH_SPRITES, CATCH_HIGH_SPRITE_N), pick(TOSS_CATCH_HIGH_TEXTS, TOSS_CATCH_HIGH_TEXT_N), hs);
        else if (hi > 24) showSprite(pick(CATCH_MED_SPRITES, CATCH_MED_SPRITE_N), pick(TOSS_CATCH_MED_TEXTS, TOSS_CATCH_MED_TEXT_N), hs);
        else showSprite(pick(CATCH_LOW_SPRITES, CATCH_LOW_SPRITE_N), pick(TOSS_CATCH_LOW_TEXTS, TOSS_CATCH_LOW_TEXT_N), hs);
        char cd[96];
        snprintf(cd, sizeof(cd), "{\\\"state\\\":\\\"landed\\\",\\\"heightIn\\\":%.1f,\\\"heightM\\\":%.3f,\\\"freefallMs\\\":%.0f}", hi, hi * 0.0254f, fs*1000);
        publishEvent("toss", cd);
        changeHappiness(10, "catch");
        tossResultTime = now;
        resultTime = now; state = STATE_RESULT;
      }
      if (tossState == TOSS_FREEFALL && now - freefallStart > 3000) {
        tossState = TOSS_IDLE;
        showSprite(pick(TOSS_LOST_SPRITES, TOSS_LOST_SPRITE_N), pick(TOSS_LOST_TEXTS, TOSS_LOST_N));
        publishEvent("toss", "{\\\"state\\\":\\\"lost\\\"}");
        changeHappiness(-5, "lost");
        tossResultTime = now; resultTime = now; state = STATE_RESULT;
      }
      break;
    case TOSS_CAUGHT:
      if (now - tossResultTime > 1500) { tossState = TOSS_IDLE; }
      break;
  }
}

// ── Power Management ─────────────────────────────────────────────────

static bool checkShouldSleep(unsigned long now) {
  if (now - lastMotionCheck > 1000) {
    float avg = (motionSamples > 0) ? motionAccum / motionSamples : 0;
    if (avg > 0.15f) lastMotionTime = now;
    motionAccum = 0; motionSamples = 0; lastMotionCheck = now;
  }
  return (now - lastMotionTime > MOTION_SLEEP_MS) || (now - lastButtonPress > BUTTON_SLEEP_MS);
}

static void drawStatsOverlay() {
  const char* moods[] = {"Sad", "Grumpy", "Content", "Happy"};
  int tier = getMoodTier();
  int barY = LAYOUT_TEXT_Y + 4;
  int barW = (int)(happiness * 1.15f);  // scale 0-100 to ~0-115px
  int barX = (135 - 115) / 2;

  clearTextArea();
  StickCP2.Display.drawRect(barX - 1, barY - 1, 117, 12, COLOR_FACE);
  uint16_t barColor = tier == 3 ? 0x07E0 : tier == 2 ? 0xFFE0 : tier == 1 ? 0xFD20 : 0xF800;
  if (barW > 0) StickCP2.Display.fillRect(barX, barY, barW, 10, barColor);
  StickCP2.Display.setTextColor(COLOR_FACE, COLOR_BG);
  StickCP2.Display.setTextDatum(BC_DATUM);
  StickCP2.Display.drawString(moods[tier], 67, LAYOUT_TEXT_Y + LAYOUT_TEXT_H - 2, 2);
}

static void enterSleep() {
  state = STATE_SLEEPING;
  // Save happiness before sleeping
  nvsWriteHappiness(happiness);
  if (ntpSynced) { time_t t; time(&t); nvsWriteLastTs((uint32_t)t); }
  webSocket.disconnect(); WiFi.disconnect(true);
  showSprite(SPRITE_SLEEP_1,"*yaaawn*"); delay(800);
  showSprite(SPRITE_SLEEP_2,"Zzz..."); delay(600);
  StickCP2.Display.setTextColor(COLOR_FACE, COLOR_BG);
  StickCP2.Display.setTextDatum(TL_DATUM);
  StickCP2.Display.drawString("z",100,30,2); delay(250);
  StickCP2.Display.drawString("z",108,18,2); delay(250);
  StickCP2.Display.drawString("Z",112,5,2); delay(400);
  Serial.println("Deep sleep..."); Serial.flush();
  esp_sleep_enable_ext1_wakeup(1ULL << GPIO_NUM_37, ESP_EXT1_WAKEUP_ALL_LOW);
  StickCP2.Power.deepSleep(0, true);
}

// ── Show Ready ───────────────────────────────────────────────────────

static void showReady() {
  StickCP2.Display.fillScreen(COLOR_BG);
  drawModeIndicator();
  if (mode == MODE_ACTIVE) {
    if (bleEnabled) {
      showSprite(SPRITE_JOYSTICK, "Remote on!");
    } else {
      showSprite(pick(IDLE_SPRITES, IDLE_SPRITE_N), pick(IDLE_TEXTS, IDLE_TEXT_N));
    }
  } else drawDebugScreen();
}

// ── Setup ────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200); delay(100);
  auto cfg = M5.config(); cfg.serial_baudrate = 0;
  StickCP2.begin(cfg);
  StickCP2.Display.setRotation(0);
  StickCP2.Display.setBrightness(80);

  auto* imuBase = StickCP2.Imu.getImuInstancePtr(0);
  if (!imuBase) {
    StickCP2.Display.fillScreen(TFT_RED);
    StickCP2.Display.setTextColor(WHITE);
    StickCP2.Display.drawString("IMU FAIL", 67, 120, 4);
    while (true) delay(1000);
  }
  mpu = static_cast<m5::MPU6886_Class*>(imuBase);

  // BLE first with NimBLE (lightweight, leaves room for SSL)
  bleInit();

  // Wand mount mode (toggle in debug screen via BtnA)
  wandMount = nvsReadWandMount();
  if (wandMount) Serial.println("Wand mount: ON (axes inverted)");

  // Happiness (tomagotchi)
  happiness = nvsReadHappiness();
  lastHappinessTs = nvsReadLastTs();
  Serial.printf("Happiness: %d (last_ts: %lu)\n", happiness, lastHappinessTs);

  // WiFi + Ably + NTP
  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASS);
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  char wsPath[256];
  snprintf(wsPath, sizeof(wsPath), "/?key=%s&format=json&v=1.2&clientId=stickman", ABLY_KEY);
  webSocket.beginSSL("realtime.ably.io", 443, wsPath);
  webSocket.onEvent(ablyEvent);
  webSocket.setReconnectInterval(3000);

  unsigned long now = millis();
  lastButtonPress = now; lastMotionTime = now; lastBlink = now;
  lastMotionCheck = now; lastTapTime = now;

  StickCP2.Display.setBrightness(80);
  StickCP2.Display.fillScreen(COLOR_BG);
  showSprite(SPRITE_WAKE_1,""); delay(400);
  showSprite(SPRITE_WAKE_1,"*yaaawn*"); delay(600);
  showSprite(SPRITE_WAKE_2,"Hiii!"); delay(800);

  state = STATE_READY;
  showReady();
  Serial.println("Stickman ready.");
}

// ── Main Loop ────────────────────────────────────────────────────────

void loop() {
  StickCP2.update();
  webSocket.loop();
  bleUpdate(); // handle BLE button release timing
  unsigned long now = millis();

  // ── BtnA: click=feed (active) or wand-mount (debug), hold=BLE toggle ──
  // Hold threshold = 1500ms so normal presses aren't misread as holds
  static bool btnAHoldFired = false;
  if (M5.BtnA.wasPressed()) { lastButtonPress = now; btnAHoldFired = false; publishEvent("btn", "{\\\"button\\\":\\\"A\\\",\\\"state\\\":\\\"down\\\"}"); }
  if (M5.BtnA.wasReleased()) {
    publishEvent("btn", "{\\\"button\\\":\\\"A\\\",\\\"state\\\":\\\"up\\\"}");
    if (!btnAHoldFired) {
      // Short press released — feed or wand mount
      if (mode == MODE_ACTIVE) {
        if (happiness < 90 && tossState != TOSS_FREEFALL) {
          changeHappiness(8, "feed");
          showSprite(pick(FEED_SPRITES, FEED_EAT_N), pick(FEED_TEXTS, FEED_TEXT_N));
          state = STATE_RESULT; resultTime = now;
        }
      } else if (mode == MODE_DEBUG) {
        wandMount = !wandMount;
        nvsWriteWandMount(wandMount);
        Serial.printf("Wand mount: %s\n", wandMount ? "ON" : "OFF");
        drawDebugScreen();
      }
    }
  }
  if (!btnAHoldFired && M5.BtnA.pressedFor(1500)) {
    btnAHoldFired = true;
    if (mode == MODE_ACTIVE) {
      bleMode = bleMode ? 0 : 1;
      nvsWriteBleMode(bleMode);
      applyBleMode();
      if (bleMode == 0) {
        showSprite(pick(BLE_OFF_SPRITES, BLE_OFF_SPRITE_N), pick(BLE_OFF_TEXTS, BLE_OFF_TEXT_N));
      } else {
        showSprite(pick(BLE_ON_SPRITES, BLE_ON_SPRITE_N), "Remote on!");
      }
      Serial.printf("BLE mode: %s\n", bleMode ? "ON" : "OFF");
      state = STATE_RESULT; resultTime = now;
    }
  }

  // ── BtnB: short=stats (active) or exit debug, hold=enter debug ──
  static bool btnBHoldFired = false;
  if (M5.BtnB.wasPressed()) { lastButtonPress = now; btnBHoldFired = false; publishEvent("btn", "{\\\"button\\\":\\\"B\\\",\\\"state\\\":\\\"down\\\"}"); }
  if (M5.BtnB.wasReleased()) {
    publishEvent("btn", "{\\\"button\\\":\\\"B\\\",\\\"state\\\":\\\"up\\\"}");
    if (!btnBHoldFired) {
      if (mode == MODE_ACTIVE) {
        drawStatsOverlay();
        state = STATE_RESULT; resultTime = now;
      } else if (mode == MODE_DEBUG) {
        mode = MODE_ACTIVE;
        publishEvent("mode", "{\\\"mode\\\":\\\"active\\\"}");
        tossState = TOSS_IDLE; prevHpMag = 0; tapSettleCount = -1;
        for (int i = 0; i < 3; i++) { hpState[i] = 0; hpPrevRaw[i] = 0; }
        state = STATE_READY;
        showReady();
      }
    }
  }
  if (!btnBHoldFired && M5.BtnB.pressedFor(1500)) {
    btnBHoldFired = true;
    if (mode == MODE_ACTIVE) {
      mode = MODE_DEBUG;
      publishEvent("mode", "{\\\"mode\\\":\\\"debug\\\"}");
      tossState = TOSS_IDLE; prevHpMag = 0; tapSettleCount = -1;
      for (int i = 0; i < 3; i++) { hpState[i] = 0; hpPrevRaw[i] = 0; }
      state = STATE_READY;
      showReady();
    }
  }

  // IMU — [C8] skip frame if I2C read fails
  if (!readIMUFull()) { delay(1); return; }
  float accMag = sqrtf(imuAx*imuAx + imuAy*imuAy + imuAz*imuAz);
  publishIMU();

  motionAccum += fabsf(accMag - 1.0f) + fabsf(imuGz) * 0.01f;
  motionSamples++;

  switch (state) {
    case STATE_READY: {
      if (mode != MODE_DEBUG && checkShouldSleep(now)) { enterSleep(); return; }
      if (mode == MODE_DEBUG) {
        if (now - lastDebugDraw > 500) {
          drawDebugScreen();
          lastDebugDraw = now;
        }
        break;
      }

      // NTP time decay (run once after WiFi connects)
      if (!ntpDecayApplied && WiFi.status() == WL_CONNECTED) {
        struct tm ti;
        if (getLocalTime(&ti, 0)) {
          ntpSynced = true;
          time_t tnow; time(&tnow);
          uint32_t nowTs = (uint32_t)tnow;
          if (lastHappinessTs > 0 && nowTs > lastHappinessTs) {
            uint32_t twoHoursElapsed = (nowTs - lastHappinessTs) / 7200;  // decay every 2 hours (gentle)
            if (twoHoursElapsed > 0) {
              int16_t val = (int16_t)happiness - (int16_t)twoHoursElapsed;
              if (val < 40) val = 40;  // wake clamp — always at least content
              happiness = (uint8_t)val;
              nvsWriteHappiness(happiness);
              Serial.printf("Time decay: -%lu periods, happiness now %d\n", twoHoursElapsed, happiness);
            }
          }
          lastHappinessTs = nowTs;
          nvsWriteLastTs(lastHappinessTs);
          ntpDecayApplied = true;
        }
      }

      // Periodic NVS save (every 10 min)
      {
        static unsigned long lastNvsSave = 0;
        if (now - lastNvsSave > 600000) {
          lastNvsSave = now;
          nvsWriteHappiness(happiness);
          if (ntpSynced) { time_t t; time(&t); nvsWriteLastTs((uint32_t)t); }
        }
      }

      // Idle sprite animation (skip during active toss)
      if (tossState == TOSS_IDLE) {
        // Swap idle sprite + text periodically — mood-filtered
        if (now - lastBlink > blinkInterval) {
          int tier = getMoodTier();
          SpriteIdx idleSprite;
          const char* idleText;
          if (tier == 3) {
            // Happy: companion sprites 40%, motivational texts 25%
            if (random(100) < 40) {
              idleSprite = pick(COMPANION_SPRITES, COMPANION_SPRITE_N);
            } else {
              idleSprite = pick(HAPPY_IDLE_SPRITES, HAPPY_IDLE_SPRITE_N);
            }
            idleText = (random(100) < 25) ? pick(MOTIV_TEXTS, MOTIV_TEXT_N) : pick(IDLE_TEXTS, IDLE_TEXT_N);
          } else if (tier == 2) {
            // Content: companion sprites 25%, motivational texts 15%
            if (random(100) < 25) {
              idleSprite = pick(COMPANION_SPRITES, COMPANION_SPRITE_N);
            } else {
              idleSprite = pick(IDLE_SPRITES, IDLE_SPRITE_N);
            }
            idleText = (random(100) < 15) ? pick(MOTIV_TEXTS, MOTIV_TEXT_N) : pick(IDLE_TEXTS, IDLE_TEXT_N);
          } else if (tier == 1) {
            idleSprite = pick(GRUMPY_IDLE_SPRITES, GRUMPY_IDLE_SPRITE_N);
            idleText = pick(SASSY_TEXTS, SASSY_TEXT_N);
          } else {
            idleSprite = pick(SAD_IDLE_SPRITES, SAD_IDLE_SPRITE_N);
            idleText = pick(SAD_TEXTS, SAD_TEXT_N);
          }
          showSprite(idleSprite, idleText);
          lastBlink = now;
          blinkInterval = random(3000, 7000);  // swap every 3-7s (was 5-12s)
        }
        // React to tilt — show orientation-reactive sprite
        {
          int8_t tilt = 0;
          if (imuAx > 0.5f) tilt = 1;       // tilted left
          else if (imuAx < -0.5f) tilt = 2;  // tilted right
          if (imuAy < -0.3f) tilt = 3;       // upside down (overrides L/R)
          if (tilt != prevTilt && (now - lastTiltChange > TILT_CHANGE_MS)) {
            prevTilt = tilt;
            lastTiltChange = now;
            if (tilt == 1) showSprite(pick(TILT_LEFT_SPRITES, TILT_LEFT_SPRITE_N), pick(TILT_TEXTS, TILT_TEXT_N));
            else if (tilt == 2) showSprite(pick(TILT_RIGHT_SPRITES, TILT_RIGHT_SPRITE_N), pick(TILT_TEXTS, TILT_TEXT_N));
            else if (tilt == 3) showSprite(pick(TILT_UP_SPRITES, TILT_UP_SPRITE_N), pick(TILT_UP_TEXTS, TILT_UP_TEXT_N));
            else { showSprite(pick(IDLE_SPRITES, IDLE_SPRITE_N), pick(IDLE_TEXTS, IDLE_TEXT_N)); lastBlink = now; }
          }
        }
      }

      // Remote mode: tilt sends arrow keys (only in READY, not during result)
      if (bleEnabled && now - lastJoySend >= JOY_SEND_INTERVAL_MS) {
        bleSendArrows();
        lastJoySend = now;
      }

      // Detect petting (gentle rocking)
      if (tossState == TOSS_IDLE && detectPetting(imuAx)) {
        changeHappiness(3, "pet");
        showSprite(SPRITE_PET, pick(PET_TEXTS, PET_TEXT_N));
        state = STATE_RESULT; resultTime = now;
      }

      // Detect tap → show bonk sprite + send BLE select + publish + happiness
      if (detectTap(imuAx, imuAy, imuAz)) {
        state = STATE_RESULT; resultTime = now;
        publishEvent("gesture", "{\\\"gesture\\\":\\\"Tap\\\"}");
        bleSendKey(KEY_RETURN); // Apple TV select/enter
        showSprite(pick(TAP_SPRITES, TAP_SPRITE_N), pick(TAP_TEXTS, TAP_TEXT_N));
        changeHappiness(-2, "tap");
      }
      updateToss(accMag, now);
      break;
    }
    case STATE_RESULT:
      // Keep checking toss during result (for freefall → catch transitions)
      updateToss(accMag, now);
      // Animate 2-frame sprites while airborne or lost (she flails!)
      if (now - lastAnimSwap > 350) {
        lastAnimSwap = now;
        if (tossState == TOSS_FREEFALL) {
          drawSprite(currentSprite == SPRITE_TOSS_AIR_1 ? SPRITE_TOSS_AIR_2 : SPRITE_TOSS_AIR_1);
        } else if (currentSprite == SPRITE_TOSS_LOST_1 || currentSprite == SPRITE_TOSS_LOST_2) {
          drawSprite(currentSprite == SPRITE_TOSS_LOST_1 ? SPRITE_TOSS_LOST_2 : SPRITE_TOSS_LOST_1);
        }
      }
      if (now - resultTime > 1200) { state = STATE_READY; lastBlink = now; blinkInterval = 500; }  // quick return, idle picks up on next cycle
      break;
    default: break;
  }

  delay(10);
}
