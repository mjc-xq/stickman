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

// ── Colors ───────────────────────────────────────────────────────────
#define COLOR_BG    0xF79E
#define COLOR_FACE  0x4228
#define COLOR_INNER 0x6328

// ── App Modes (BtnB toggles) ─────────────────────────────────────────
enum AppMode { MODE_ACTIVE, MODE_DEBUG };

// ── Gesture Types ────────────────────────────────────────────────────
enum GestureType {
  GESTURE_NONE = 0, GESTURE_CIRCLE_LEFT, GESTURE_CIRCLE_RIGHT,
  GESTURE_TAP, GESTURE_THRUST
};
static const char* GESTURE_NAMES[] = {
  "None", "Circle Left", "Circle Right", "Tap", "Thrust"
};

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

// ── Wand Gesture State ───────────────────────────────────────────────
static float gyroAccum = 0;       // total rotation magnitude
static int gyroDir = 0;           // +1 or -1 for direction
static float prevAccMag = 0;
static float thrustAccum = 0;
static int thrustSamples = 0;
static unsigned long lastTapTime = 0, lastGestureTime = 0, lastGyroTime = 0;
static const unsigned long GESTURE_COOLDOWN_MS = 600;

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

static FaceType currentFace = FACE_IDX_DEFAULT;

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

// ── Gesture Detection (always active) ────────────────────────────────
// Fixed: use total gyro magnitude for circles, lower thresholds for thrust

static GestureType detectGesture(float accMag) {
  unsigned long now = millis();

  // Always update prevAccMag to avoid stale deltas after cooldown
  float accDelta = fabsf(accMag - prevAccMag);
  prevAccMag = accMag;

  // Always accumulate gyro (even during cooldown) so circles don't get lost
  float dt = (lastGyroTime > 0) ? (now - lastGyroTime) / 1000.0f : 0.02f;
  lastGyroTime = now;
  if (dt > 0.1f) dt = 0.02f;

  float gyroMag = sqrtf(imuGx*imuGx + imuGy*imuGy + imuGz*imuGz);
  if (gyroMag > 30.0f) {
    if (gyroDir == 0) {
      gyroDir = (fabsf(imuGz) > fabsf(imuGx) && fabsf(imuGz) > fabsf(imuGy))
        ? (imuGz > 0 ? 1 : -1)
        : (fabsf(imuGx) > fabsf(imuGy) ? (imuGx > 0 ? 1 : -1) : (imuGy > 0 ? 1 : -1));
    }
    gyroAccum += gyroMag * dt;
  } else {
    gyroAccum *= 0.93f;
    if (gyroAccum < 10.0f) { gyroAccum = 0; gyroDir = 0; }
  }

  // Don't fire gestures during cooldown or active toss
  if (now - lastGestureTime < GESTURE_COOLDOWN_MS) return GESTURE_NONE;
  if (tossState != TOSS_IDLE) return GESTURE_NONE;

  // CIRCLE: fires when rotation stops after accumulating enough
  if (gyroMag < 30.0f && gyroAccum > 120.0f) {
    GestureType g = (gyroDir > 0) ? GESTURE_CIRCLE_RIGHT : GESTURE_CIRCLE_LEFT;
    gyroAccum = 0; gyroDir = 0;
    lastGestureTime = now;
    return g;
  }

  // THRUST: sustained strong accel (checked before tap to avoid tap stealing)
  if (accMag > 1.8f) {
    thrustAccum += accMag;
    thrustSamples++;
    if (thrustSamples >= 3 && thrustAccum / thrustSamples > 2.0f) {
      thrustAccum = 0; thrustSamples = 0;
      lastGestureTime = now;
      return GESTURE_THRUST;
    }
  } else {
    // If we had some thrust samples but not enough, and there was a sharp spike,
    // that's a tap (not a failed thrust attempt)
    thrustAccum = 0; thrustSamples = 0;
  }

  // TAP: sharp spike — only if thrust isn't accumulating
  if (thrustSamples == 0 && accDelta > 1.8f && now - lastTapTime > 400) {
    lastTapTime = now; lastGestureTime = now;
    return GESTURE_TAP;
  }

  return GESTURE_NONE;
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
        showFace(FACE_IDX_SHOCKED, "AAAH!");
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
        if (hi > 48) showFace(FACE_IDX_SHOCKED,"SO HIGH!",hs);
        else if (hi > 24) showFace(FACE_IDX_SILLY,"Wow!",hs);
        else if (hi > 8) showFace(FACE_IDX_HAPPY,"Nice!",hs);
        else showFace(FACE_IDX_DEFAULT,"Caught!",hs);
        char cd[96];
        snprintf(cd, sizeof(cd), "{\\\"state\\\":\\\"landed\\\",\\\"heightIn\\\":%.1f,\\\"freefallMs\\\":%.0f}", hi, fs*1000);
        publishEvent("toss", cd);
        tossResultTime = now;
        resultTime = now; state = STATE_RESULT;
      }
      if (tossState == TOSS_FREEFALL && now - freefallStart > 3000) {
        tossState = TOSS_IDLE;
        showFace(FACE_IDX_SAD, "Lost me?");
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
  showFace(FACE_IDX_TIRED,"*yawn*"); delay(800);
  showFace(FACE_IDX_TIRED,"Zzz..."); delay(600);
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
  if (mode == MODE_ACTIVE) showFace(FACE_IDX_HAPPY, "Ready!");
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
  lastMotionCheck = now; lastGestureTime = now;

  StickCP2.Display.setBrightness(80);
  StickCP2.Display.fillScreen(COLOR_BG);
  showFace(FACE_IDX_TIRED,""); delay(400);
  showFace(FACE_IDX_TIRED,"*yawn*"); delay(600);
  showFace(FACE_IDX_HAPPY,"Hi there!"); delay(800);

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
    gyroAccum = 0; gyroDir = 0; thrustAccum = 0; thrustSamples = 0;
    prevAccMag = 0; lastGyroTime = 0; isBlinking = false;
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
        if (now - lastBlink > blinkInterval && !isBlinking) {
          if (random(4) == 0) { drawFace(random(2) ? FACE_IDX_SILLY : FACE_IDX_DEFAULT); isBlinking = true; }
          lastBlink = now; blinkInterval = random(8000, 20000);
        }
        if (isBlinking && now - lastBlink >= 400) { drawFace(FACE_IDX_HAPPY); isBlinking = false; }
      }

      // Always detect BOTH gestures and tosses
      GestureType g = detectGesture(accMag);
      if (g != GESTURE_NONE) {
        state = STATE_RESULT; resultTime = now;
        char gd[64];
        snprintf(gd, sizeof(gd), "{\\\"gesture\\\":\\\"%s\\\"}", GESTURE_NAMES[g]);
        publishEvent("gesture", gd);
        switch (g) {
          case GESTURE_CIRCLE_LEFT:  showFace(FACE_IDX_DIZZY,"Circle","Left!"); break;
          case GESTURE_CIRCLE_RIGHT: showFace(FACE_IDX_DIZZY,"Circle","Right!"); break;
          case GESTURE_TAP:          showFace(FACE_IDX_SHOCKED,"Tap!"); break;
          case GESTURE_THRUST:       showFace(FACE_IDX_SILLY,"Thrust!"); break;
          default: break;
        }
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
