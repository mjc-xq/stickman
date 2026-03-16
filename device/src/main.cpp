#include <M5StickCPlus2.h>
#include <utility/imu/MPU6886_Class.hpp>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include "faces.h"

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

// ── App Modes (BtnB toggles) ─────────────────────────────────────────
enum AppMode { MODE_ACTIVE, MODE_DEBUG };

// ── Gesture ──────────────────────────────────────────────────────────
// Single gesture: wand tap (sharp flick in any direction)
static const char* TAP_NAME = "Tap";

// ── Toss / App States ────────────────────────────────────────────────
enum TossState { TOSS_IDLE, TOSS_LAUNCHED, TOSS_FREEFALL, TOSS_CAUGHT };
enum AppState  { STATE_READY, STATE_RESULT, STATE_SLEEPING };

static AppMode mode = MODE_ACTIVE;
static AppState state = STATE_READY;
static unsigned long resultTime = 0;

// ── Idle face animation ──────────────────────────────────────────────
static unsigned long lastBlink = 0;
static unsigned long blinkInterval = 4000;
static bool isBlinking = false;

// ── Power Management ─────────────────────────────────────────────────
static unsigned long lastButtonPress = 0;
static unsigned long lastMotionTime = 0;
static const unsigned long MOTION_SLEEP_MS = 60000;
static const unsigned long BUTTON_SLEEP_MS = 180000;

// ── IMU ──────────────────────────────────────────────────────────────
static m5::MPU6886_Class* mpu = nullptr;
static float imuAx, imuAy, imuAz, imuGx, imuGy, imuGz;

static void readIMUFull() {
  uint8_t buf[14];
  mpu->readRegister(m5::MPU6886_Class::REG_ACCEL_XOUT_H, buf, 14);
  imuAx = (int16_t)((buf[0] << 8) | buf[1]) * (8.0f / 32768.0f);
  imuAy = (int16_t)((buf[2] << 8) | buf[3]) * (8.0f / 32768.0f);
  imuAz = (int16_t)((buf[4] << 8) | buf[5]) * (8.0f / 32768.0f);
  imuGx = (int16_t)((buf[8] << 8) | buf[9]) * (2000.0f / 32768.0f);
  imuGy = (int16_t)((buf[10] << 8) | buf[11]) * (2000.0f / 32768.0f);
  imuGz = (int16_t)((buf[12] << 8) | buf[13]) * (2000.0f / 32768.0f);
}

// ── Tap Detection State ──────────────────────────────────────────────
static float prevAccMag = 1.0f;
static float prevPrevAccMag = 1.0f;  // two-sample history for spike shape
static unsigned long lastTapTime = 0;
static const unsigned long TAP_COOLDOWN_MS = 500;

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
  if (now - lastAblyPublish < 100) return;
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

// ── Face Drawing ─────────────────────────────────────────────────────

static FaceType currentFace = FACE_IDX_HAPPY;
static unsigned long lastRandomFaceChange = 0;

static FaceType pick(const FaceType* list, int n) { return list[random(n)]; }
static const char* pick(const char* const* list, int n) { return list[random(n)]; }

// ── Face + text pools for every context ──────────────────────────────

static const FaceType IDLE_FACES[] = {
  FACE_IDX_HAPPY, FACE_IDX_HOPEFUL, FACE_IDX_WINK, FACE_IDX_CHEEKY,
  FACE_IDX_SMIRK, FACE_IDX_SINGING, FACE_IDX_CONTENT, FACE_IDX_CALM,
  FACE_IDX_CHEERFUL, FACE_IDX_PLEASED, FACE_IDX_FRIENDLY,
  FACE_IDX_GRATEFUL, FACE_IDX_AMUSED, FACE_IDX_CURIOUS,
  FACE_IDX_ATTENTIVE, FACE_IDX_INTRIGUED, FACE_IDX_MISCHIEVOUS
};
#define IDLE_N 17

static const char* const IDLE_TEXTS[] = {
  "La la la~", "Hmm hmm~", "Hi!", "*vibes*", "Hehe", ":)",
  "Comfy~", "Nice day!", "*hums*", "Oh hey!", "Teehee",
  "Sup!", "Boop!", "*wiggles*", "*sparkle*", "Yay~", "Meow?"
};
#define IDLE_TEXT_N 17

static const FaceType MOVE_FACES[] = {
  FACE_IDX_EXCITED, FACE_IDX_SURPRISED, FACE_IDX_NERVOUS,
  FACE_IDX_CONFUSED, FACE_IDX_THINKING, FACE_IDX_CURIOUS,
  FACE_IDX_INTRIGUED, FACE_IDX_ATTENTIVE, FACE_IDX_AMUSED
};
#define MOVE_N 9

static const char* const MOVE_TEXTS[] = {
  "Whoa!", "Ooh!", "Huh?", "Hmm?", "Where we", "going?",
  "Wee!", "Wobbly!", "Adventure!", "Zoom!", "Wait up!"
};
#define MOVE_TEXT_N 11

static const char* const TAP_TEXTS[] = {
  "Oww!", "Hey!", "Oof!", "Rude!", "Bonk!", "Ouch!",
  "Ack!", "Stop it!", "Meanie!", "Bap!", "Not cool!", "Eeek!"
};
#define TAP_TEXT_N 12

static const FaceType TAP_FACES[] = {
  FACE_IDX_ANNOYED, FACE_IDX_ANGRY, FACE_IDX_DISGUSTED,
  FACE_IDX_SHOCKED, FACE_IDX_EMBARRASSED
};
#define TAP_FACE_N 5


static const char* const TOSS_AIR_TEXTS[] = {
  "AAAH!", "Wheeee!", "Flying!", "I'm up!", "Woooo!",
  "So high!", "Weee!", "Oh wow!", "Airborne!"
};
#define TOSS_AIR_N 9

static const char* const TOSS_CATCH_HIGH[] = {
  "Wooow!", "Epic!", "Sky high!", "Insane!", "Unreal!"
};
#define TOSS_CATCH_HIGH_N 5

static const char* const TOSS_CATCH_MED[] = {
  "So fun!", "Nice one!", "Great!", "Awesome!", "Woohoo!"
};
#define TOSS_CATCH_MED_N 5

static const char* const TOSS_CATCH_LOW[] = {
  "Yay!", "Hehe!", "Caught!", "Whew!", "Got me!", "Safe!"
};
#define TOSS_CATCH_LOW_N 6

static const char* const TOSS_LOST_TEXTS[] = {
  "Oh no!", "Where am", "I?!", "*crying*", "Come back!", "Help!"
};
#define TOSS_LOST_N 6

static void drawFace(FaceType face) {
  currentFace = face;
  const uint8_t* data = (const uint8_t*)pgm_read_ptr(&FACE_DATA[face]);
  int x = (135 - FACE_W) / 2;
  int y = 20;
  uint16_t lineBuf[FACE_W];
  const uint16_t fg = (uint16_t)BLACK, bg = (uint16_t)WHITE;
  for (int row = 0; row < FACE_H; row++) {
    for (int col = 0; col < FACE_W; col++) {
      int byteIdx = row * FACE_ROW_BYTES + (col >> 3);
      int bitIdx = 7 - (col & 7);
      lineBuf[col] = (pgm_read_byte(&data[byteIdx]) & (1 << bitIdx)) ? fg : bg;
    }
    StickCP2.Display.pushImage(x, y + row, FACE_W, 1, lineBuf);
  }
  if (x > 0) {
    StickCP2.Display.fillRect(0, y, x, FACE_H, WHITE);
    StickCP2.Display.fillRect(x + FACE_W, y, 135 - x - FACE_W, FACE_H, WHITE);
  }
}

static void clearTextArea() { StickCP2.Display.fillRect(0, 155, 135, 85, COLOR_BG); }

static void showMessage(const char* l1, const char* l2 = nullptr) {
  clearTextArea();
  StickCP2.Display.setTextColor(COLOR_FACE, COLOR_BG);
  StickCP2.Display.setTextDatum(BC_DATUM);
  if (l2) {
    StickCP2.Display.drawString(l1, 67, 200, 4);
    StickCP2.Display.drawString(l2, 67, 232, 4);
  } else {
    StickCP2.Display.drawString(l1, 67, 220, 4);
  }
}

static void showFace(FaceType face, const char* m1, const char* m2 = nullptr) {
  drawFace(face); showMessage(m1, m2);
}

static void drawModeIndicator() {
  StickCP2.Display.fillRect(0, 0, 135, 18, COLOR_INNER);
  StickCP2.Display.setTextColor(COLOR_BG, COLOR_INNER);
  StickCP2.Display.setTextDatum(TC_DATUM);
  StickCP2.Display.drawString(mode == MODE_ACTIVE ? "~ Stickman ~" : "# Debug #", 67, 1, 2);
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
    StickCP2.Display.drawString(buf, 4, y, 2);
  }
}

// ── Tap Detection ────────────────────────────────────────────────────
// Detects a sharp flick/tap in any direction using accel magnitude.
// Uses a "spike shape" check: magnitude must jump UP then come back DOWN.
// This prevents false triggers from sustained motion (like tossing).

static bool detectTap(float accMag) {
  unsigned long now = millis();

  // Shift history
  float delta = accMag - prevAccMag;
  float prevDelta = prevAccMag - prevPrevAccMag;
  prevPrevAccMag = prevAccMag;
  prevAccMag = accMag;

  // Skip during cooldown or active toss
  if (now - lastTapTime < TAP_COOLDOWN_MS) return false;
  if (tossState != TOSS_IDLE) return false;

  // Spike shape: previous sample was a peak (rose then fell)
  // prevDelta > 0 means it was rising, delta < 0 means it's now falling
  // The peak magnitude (prevAccMag before shift = current prevAccMag...
  // actually we need the peak value which is the previous accMag)
  //
  // Simpler: just check if the magnitude spiked above threshold and
  // the change was sharp (large delta in one step)
  if (fabsf(delta) > 1.5f && accMag > 1.8f) {
    lastTapTime = now;
    return true;
  }

  return false;
}

// ── Toss Detection (always active, runs alongside gestures) ──────────

static void updateToss(float accMag, unsigned long now) {
  switch (tossState) {
    case TOSS_IDLE:
      if (accMag > 2.5f) { // higher threshold to avoid gesture false triggers
        launchAccPeak = accMag; launchTime = now;
        tossState = TOSS_LAUNCHED;
      }
      break;
    case TOSS_LAUNCHED:
      if (accMag > launchAccPeak) launchAccPeak = accMag;
      if (accMag < 0.4f) {
        tossState = TOSS_FREEFALL; freefallStart = now; freefallSamples = 0;
        showFace(FACE_IDX_SHOCKED, pick(TOSS_AIR_TEXTS, TOSS_AIR_N));
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
        if (hi > 48) showFace(FACE_IDX_SHOCKED, pick(TOSS_CATCH_HIGH, TOSS_CATCH_HIGH_N), hs);
        else if (hi > 24) showFace(FACE_IDX_EXCITED, pick(TOSS_CATCH_MED, TOSS_CATCH_MED_N), hs);
        else if (hi > 8) showFace(FACE_IDX_PROUD, pick(TOSS_CATCH_LOW, TOSS_CATCH_LOW_N), hs);
        else showFace(FACE_IDX_HAPPY, pick(TOSS_CATCH_LOW, TOSS_CATCH_LOW_N), hs);
        char cd[96];
        snprintf(cd, sizeof(cd), "{\\\"state\\\":\\\"landed\\\",\\\"heightIn\\\":%.1f,\\\"freefallMs\\\":%.0f}", hi, fs*1000);
        publishEvent("toss", cd);
        tossResultTime = now;
        resultTime = now; state = STATE_RESULT;
      }
      if (tossState == TOSS_FREEFALL && now - freefallStart > 3000) {
        tossState = TOSS_IDLE;
        showFace(FACE_IDX_CRYING, pick(TOSS_LOST_TEXTS, TOSS_LOST_N));
        publishEvent("toss", "{\\\"state\\\":\\\"lost\\\"}");
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

static void enterSleep() {
  state = STATE_SLEEPING;
  webSocket.disconnect(); WiFi.disconnect(true);
  showFace(FACE_IDX_SLEEPY,"*yaaawn*"); delay(800);
  showFace(FACE_IDX_SLEEPY,"Zzz..."); delay(600);
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
  if (mode == MODE_ACTIVE) showFace(pick(IDLE_FACES, IDLE_N), pick(IDLE_TEXTS, IDLE_TEXT_N));
  else drawDebugScreen();
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

  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASS);
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
  showFace(FACE_IDX_SLEEPY,""); delay(400);
  showFace(FACE_IDX_SLEEPY,"*yaaawn*"); delay(600);
  showFace(FACE_IDX_HAPPY,"Hiii!"); delay(800);

  state = STATE_READY;
  showReady();
  Serial.println("Stickman ready.");
}

// ── Main Loop ────────────────────────────────────────────────────────

void loop() {
  StickCP2.update();
  webSocket.loop();
  unsigned long now = millis();

  // Buttons
  if (M5.BtnA.wasPressed()) {
    lastButtonPress = now;
    publishEvent("btn", "{\\\"button\\\":\\\"A\\\",\\\"state\\\":\\\"down\\\"}");
  }
  if (M5.BtnA.wasReleased()) publishEvent("btn", "{\\\"button\\\":\\\"A\\\",\\\"state\\\":\\\"up\\\"}");
  if (M5.BtnB.wasPressed()) {
    lastButtonPress = now;
    publishEvent("btn", "{\\\"button\\\":\\\"B\\\",\\\"state\\\":\\\"down\\\"}");
    mode = (mode == MODE_ACTIVE) ? MODE_DEBUG : MODE_ACTIVE;
    publishEvent("mode", mode == MODE_ACTIVE ? "{\\\"mode\\\":\\\"active\\\"}" : "{\\\"mode\\\":\\\"debug\\\"}");
    prevAccMag = 1.0f; prevPrevAccMag = 1.0f; isBlinking = false;
    tossState = TOSS_IDLE; state = STATE_READY;
    showReady();
    return;
  }
  if (M5.BtnB.wasReleased()) publishEvent("btn", "{\\\"button\\\":\\\"B\\\",\\\"state\\\":\\\"up\\\"}");

  // IMU
  readIMUFull();
  float accMag = sqrtf(imuAx*imuAx + imuAy*imuAy + imuAz*imuAz);
  publishIMU();
  motionAccum += fabsf(accMag - 1.0f) + fabsf(imuGz) * 0.01f;
  motionSamples++;

  switch (state) {
    case STATE_READY: {
      if (mode != MODE_DEBUG && checkShouldSleep(now)) { enterSleep(); return; }
      if (mode == MODE_DEBUG) {
        if (now - lastDebugDraw > 500) { drawDebugScreen(); lastDebugDraw = now; }
        break;
      }

      // Idle face animation (skip during active toss)
      if (tossState == TOSS_IDLE) {
        // Swap idle face + text periodically
        if (now - lastBlink > blinkInterval) {
          showFace(pick(IDLE_FACES, IDLE_N), pick(IDLE_TEXTS, IDLE_TEXT_N));
          lastBlink = now;
          blinkInterval = random(5000, 12000);
        }
        // React to gentle movement with a different face
        float gyroMag = sqrtf(imuGx*imuGx + imuGy*imuGy + imuGz*imuGz);
        if (gyroMag > 20.0f && now - lastRandomFaceChange > 2500) {
          showFace(pick(MOVE_FACES, MOVE_N), pick(MOVE_TEXTS, MOVE_TEXT_N));
          lastRandomFaceChange = now;
        }
      }

      // Detect tap and toss
      if (detectTap(accMag)) {
        state = STATE_RESULT; resultTime = now;
        publishEvent("gesture", "{\\\"gesture\\\":\\\"Tap\\\"}");
        showFace(pick(TAP_FACES, TAP_FACE_N), pick(TAP_TEXTS, TAP_TEXT_N));
      }
      updateToss(accMag, now);
      break;
    }
    case STATE_RESULT:
      // Keep checking toss during result (for freefall → catch transitions)
      updateToss(accMag, now);
      if (now - resultTime > 1500) { state = STATE_READY; showReady(); lastBlink = now; }
      break;
    default: break;
  }

  delay(10);
}
