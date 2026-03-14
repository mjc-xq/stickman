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

// ── Color Palette (RGB565) ────────────────────────────────────────────
#define COLOR_BG    0xF79E  // Light Cream
#define COLOR_FACE  0x4228  // Dark Coffee (face line color)
#define COLOR_INNER 0x6328  // Mode indicator bar

// ── App Modes ────────────────────────────────────────────────────────
enum AppMode { MODE_WAND, MODE_TOSS, MODE_DEBUG };

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

static AppMode mode = MODE_WAND;
static AppState state = STATE_READY;
static GestureType lastGesture = GESTURE_NONE;
static unsigned long resultTime = 0;

// ── Blink ────────────────────────────────────────────────────────────
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

// ── Wand State ───────────────────────────────────────────────────────
static float gyroZAccum = 0, prevAccMag = 0, thrustAccum = 0;
static int thrustSamples = 0;
static unsigned long lastTapTime = 0, lastGestureTime = 0, lastGyroTime = 0;
static const unsigned long GESTURE_COOLDOWN_MS = 800;

// ── Toss State ───────────────────────────────────────────────────────
static TossState tossState = TOSS_IDLE;
static unsigned long freefallStart = 0, freefallEnd = 0, tossResultTime = 0, launchTime = 0;
static float lastTossHeight = 0, launchAccPeak = 0;
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
static unsigned long ablyMsgCount = 0;
static unsigned long ablyMsgCountStart = 0;
static float ablyRate = 0;
static unsigned long ablyMsgSerial = 0;

// Previous IMU values for change detection
static float prevPitch = 0, prevRoll = 0;
static float prevSentAx = 0, prevSentAy = 0, prevSentAz = 0;

// ── Debug display ────────────────────────────────────────────────────
static unsigned long lastDebugDraw = 0;

// ── IMU full read (all 6 axes) ───────────────────────────────────────
static float imuAx, imuAy, imuAz, imuGx, imuGy, imuGz;

static void readIMUFull() {
  int16_t ax, ay, az, gx, gy, gz;
  uint8_t buf[14];
  // Read accel + temp + gyro in one burst for coherency
  mpu->readRegister(m5::MPU6886_Class::REG_ACCEL_XOUT_H, buf, 14);
  ax = (int16_t)((buf[0] << 8) | buf[1]);
  ay = (int16_t)((buf[2] << 8) | buf[3]);
  az = (int16_t)((buf[4] << 8) | buf[5]);
  // buf[6..7] = temp, skip
  gx = (int16_t)((buf[8] << 8) | buf[9]);
  gy = (int16_t)((buf[10] << 8) | buf[11]);
  gz = (int16_t)((buf[12] << 8) | buf[13]);
  imuAx = ax * (8.0f / 32768.0f);
  imuAy = ay * (8.0f / 32768.0f);
  imuAz = az * (8.0f / 32768.0f);
  imuGx = gx * (2000.0f / 32768.0f);
  imuGy = gy * (2000.0f / 32768.0f);
  imuGz = gz * (2000.0f / 32768.0f);
}

// ── Ably WebSocket handlers ──────────────────────────────────────────

static void ablyAttach() {
  char attach[128];
  snprintf(attach, sizeof(attach),
    "{\"action\":10,\"channel\":\"%s\"}", ABLY_CHANNEL);
  webSocket.sendTXT(attach);
}

static void ablyEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.println("Ably: WS connected");
      break;
    case WStype_TEXT: {
      char* text = (char*)payload;
      // Parse action number from the message (avoid strstr false matches)
      // Format is always {"action":N,... where N is 1-2 digits
      int action = -1;
      const char* ap = strstr(text, "\"action\":");
      if (ap) action = atoi(ap + 9);

      if (action == 0) {
        // Heartbeat — one-way liveness signal from server, no response needed
      }
      else if (action == 4) {
        // CONNECTED
        Serial.println("Ably: CONNECTED");
        ablyMsgSerial = 0;
        ablyAttach();
        ablyState = ABLY_CONNECTED;
      }
      else if (action == 11) {
        // ATTACHED
        Serial.printf("Ably: ATTACHED to %s\n", ABLY_CHANNEL);
        ablyState = ABLY_ATTACHED;
        ablyMsgCount = 0;
        ablyMsgCountStart = millis();
      }
      else if (action == 2) {
        // NACK
        Serial.printf("Ably NACK: %.*s\n", (int)fminf(length, 100), text);
      }
      else if (action == 13 || action == 9) {
        // DETACHED or ERROR — re-attach
        Serial.printf("Ably ERR: %.*s\n", (int)fminf(length, 120), text);
        ablyState = ABLY_CONNECTED;
        ablyAttach();
      }
      // Action 1=ACK, 14=PRESENCE, 15=MESSAGE — ignore
      break;
    }
    case WStype_DISCONNECTED:
      Serial.println("Ably: disconnected");
      ablyState = ABLY_DISCONNECTED;
      // Reset change-tracking so first message after reconnect always publishes
      prevPitch = 0; prevRoll = 0;
      prevSentAx = 0; prevSentAy = 0; prevSentAz = 0;
      break;
    default:
      break;
  }
}

// Publish a named event with a simple JSON data string (no rate limit)
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

  // Max 10Hz (100ms) — ~600/min max during sustained motion, 0 when still
  if (now - lastAblyPublish < 100) return;

  // Compute pitch/roll from accel (degrees)
  float pitch = atan2f(imuAx, sqrtf(imuAy*imuAy + imuAz*imuAz)) * 57.2958f;
  float roll  = atan2f(imuAy, sqrtf(imuAx*imuAx + imuAz*imuAz)) * 57.2958f;

  // Check orientation change (>= 2 degrees — 1 degree is within IMU noise)
  bool orientChanged = fabsf(pitch - prevPitch) >= 2.0f || fabsf(roll - prevRoll) >= 2.0f;

  // Check accel change — absolute threshold of 0.05g per axis (not percentage)
  bool accelChanged = fabsf(imuAx - prevSentAx) >= 0.05f
                   || fabsf(imuAy - prevSentAy) >= 0.05f
                   || fabsf(imuAz - prevSentAz) >= 0.05f;

  if (!orientChanged && !accelChanged) return;

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

// ── Sprite Face Drawing ──────────────────────────────────────────────

static FaceType currentFace = FACE_IDX_DEFAULT;

// Draw a 1-bit bitmap face centered on screen using row-buffered pushImage
// (110 pixels × 2 bytes = 220 bytes on stack per row — ~100x faster than drawPixel)
static void drawFace(FaceType face) {
  currentFace = face;
  const uint8_t* data = (const uint8_t*)pgm_read_ptr(&FACE_DATA[face]);
  int x = (135 - FACE_W) / 2;
  int y = 20;
  // Clear face area to white, then draw black pixels
  StickCP2.Display.fillRect(0, y, 135, FACE_H, WHITE);
  for (int row = 0; row < FACE_H; row++) {
    for (int col = 0; col < FACE_W; col++) {
      int byteIdx = row * FACE_ROW_BYTES + (col >> 3);
      int bitIdx = 7 - (col & 7);
      if (pgm_read_byte(&data[byteIdx]) & (1 << bitIdx)) {
        StickCP2.Display.drawPixel(x + col, y + row, BLACK);
      }
    }
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
  drawFace(face);
  showMessage(m1, m2);
}

// ── Mode indicator ───────────────────────────────────────────────────

static void drawModeIndicator() {
  StickCP2.Display.fillRect(0, 0, 135, 18, COLOR_INNER);
  StickCP2.Display.setTextColor(COLOR_BG, COLOR_INNER);
  StickCP2.Display.setTextDatum(TC_DATUM);
  const char* s = "???";
  switch (mode) {
    case MODE_WAND: s = "~ Wand Mode ~"; break;
    case MODE_TOSS: s = "^ Toss Mode ^"; break;
    case MODE_DEBUG: s = "# Debug #"; break;
    default: break;
  }
  StickCP2.Display.drawString(s, 67, 1, 2);
}

// ── Debug Screen ─────────────────────────────────────────────────────

static void drawDebugScreen() {
  StickCP2.Display.fillScreen(BLACK);
  drawModeIndicator();

  StickCP2.Display.setTextDatum(TL_DATUM);
  StickCP2.Display.setTextColor(WHITE, BLACK);
  int y = 24;
  int lh = 22;

  // WiFi
  bool wifiOk = WiFi.isConnected();
  StickCP2.Display.setTextColor(wifiOk ? GREEN : RED, BLACK);
  StickCP2.Display.drawString(wifiOk ? "WiFi: OK" : "WiFi: --", 4, y, 2);
  y += lh;

  if (wifiOk) {
    StickCP2.Display.setTextColor(CYAN, BLACK);
    char ssidLine[32];
    snprintf(ssidLine, sizeof(ssidLine), "SSID: %s", WiFi.SSID().c_str());
    StickCP2.Display.drawString(ssidLine, 4, y, 2);
    y += lh;

    int rssi = WiFi.RSSI();
    int bars = (rssi > -50) ? 4 : (rssi > -60) ? 3 : (rssi > -70) ? 2 : (rssi > -80) ? 1 : 0;
    char sigLine[32];
    snprintf(sigLine, sizeof(sigLine), "Sig: %ddBm %.*s", rssi, bars, "||||");
    StickCP2.Display.setTextColor(WHITE, BLACK);
    StickCP2.Display.drawString(sigLine, 4, y, 2);
    y += lh;

    char ipLine[32];
    snprintf(ipLine, sizeof(ipLine), "IP: %s", WiFi.localIP().toString().c_str());
    StickCP2.Display.drawString(ipLine, 4, y, 2);
    y += lh;
  } else {
    y += lh * 3;
  }

  // Battery
  int batPct = StickCP2.Power.getBatteryLevel();
  float batV = StickCP2.Power.getBatteryVoltage() / 1000.0f;
  char batLine[32];
  snprintf(batLine, sizeof(batLine), "Bat: %d%% %.2fV", batPct, batV);
  StickCP2.Display.setTextColor(batPct > 20 ? GREEN : RED, BLACK);
  StickCP2.Display.drawString(batLine, 4, y, 2);
  y += lh;

  // Ably
  const char* ablyStr;
  uint16_t ablyColor;
  switch (ablyState) {
    case ABLY_ATTACHED:     ablyStr = "Ably: Stream"; ablyColor = GREEN; break;
    case ABLY_CONNECTED:    ablyStr = "Ably: Conn";   ablyColor = YELLOW; break;
    case ABLY_DISCONNECTED: ablyStr = "Ably: --";     ablyColor = RED; break;
  }
  StickCP2.Display.setTextColor(ablyColor, BLACK);
  StickCP2.Display.drawString(ablyStr, 4, y, 2);
  y += lh;

  if (ablyState == ABLY_ATTACHED) {
    char rateLine[32];
    snprintf(rateLine, sizeof(rateLine), "Rate: %.0f msg/s", ablyRate);
    StickCP2.Display.setTextColor(WHITE, BLACK);
    StickCP2.Display.drawString(rateLine, 4, y, 2);
    y += lh;
  }
}

// ── Wand Gesture Detection ───────────────────────────────────────────

static GestureType detectWandGesture() {
  unsigned long now = millis();
  if (now - lastGestureTime < GESTURE_COOLDOWN_MS) return GESTURE_NONE;

  float accMag = sqrtf(imuAx*imuAx + imuAy*imuAy + imuAz*imuAz);

  float dt = (lastGyroTime > 0) ? (now - lastGyroTime) / 1000.0f : 0.02f;
  lastGyroTime = now;
  if (dt > 0.1f) dt = 0.02f;

  // CIRCLE
  if (fabsf(imuGz) > 50.0f) {
    gyroZAccum += imuGz * dt;
  } else {
    if (fabsf(gyroZAccum) > 180.0f) {
      GestureType g = (gyroZAccum > 0) ? GESTURE_CIRCLE_RIGHT : GESTURE_CIRCLE_LEFT;
      gyroZAccum = 0;
      lastGestureTime = now;
      return g;
    }
    gyroZAccum *= 0.92f;
    if (fabsf(gyroZAccum) < 15.0f) gyroZAccum = 0;
  }

  // THRUST
  if (fabsf(imuAy) > 2.5f) {
    thrustAccum += imuAy;
    thrustSamples++;
    if (thrustSamples >= 4 && fabsf(thrustAccum / thrustSamples) > 2.0f) {
      thrustAccum = 0; thrustSamples = 0;
      lastGestureTime = now;
      return GESTURE_THRUST;
    }
  } else { thrustAccum = 0; thrustSamples = 0; }

  // TAP
  float accDelta = fabsf(accMag - prevAccMag);
  prevAccMag = accMag;
  if (accDelta > 2.0f && now - lastTapTime > 500) {
    lastTapTime = now; lastGestureTime = now;
    return GESTURE_TAP;
  }

  return GESTURE_NONE;
}

// ── Toss Detection ───────────────────────────────────────────────────

static void updateTossDetection(float accMag, unsigned long now) {
  switch (tossState) {
    case TOSS_IDLE:
      if (accMag > 2.0f) {
        launchAccPeak = accMag; launchTime = now;
        tossState = TOSS_LAUNCHED;
      }
      break;
    case TOSS_LAUNCHED:
      if (accMag > launchAccPeak) launchAccPeak = accMag;
      if (accMag < 0.4f) {
        tossState = TOSS_FREEFALL; freefallStart = now; freefallSamples = 0;
        showFace(FACE_IDX_SHOCKED, "AAAH!");
        char launchData[64];
        snprintf(launchData, sizeof(launchData), "{\\\"state\\\":\\\"airborne\\\",\\\"launchG\\\":%.1f}", launchAccPeak);
        publishEvent("toss", launchData);
      } else if (now - launchTime > 300) { tossState = TOSS_IDLE; }
      break;
    case TOSS_FREEFALL:
      freefallSamples++;
      if (accMag < 0.6f) { /* still falling */ }
      else if (accMag > 1.3f && freefallSamples >= 1) {
        freefallEnd = now; tossState = TOSS_CAUGHT;
        float fs = (freefallEnd - freefallStart) / 1000.0f;
        float ht = fs / 2.0f;
        lastTossHeight = 0.5f * 9.81f * ht * ht;
        float hi = lastTossHeight * 39.37f;
        char hs[20];
        if (hi >= 12.0f) { int ft=(int)(hi/12.0f); int in=(int)(hi-ft*12.0f); snprintf(hs,sizeof(hs),"%d'%d\"",ft,in); }
        else snprintf(hs,sizeof(hs),"%.0f in",hi);
        if (hi > 48) showFace(FACE_IDX_SHOCKED,"SO HIGH!",hs);
        else if (hi > 24) showFace(FACE_IDX_SILLY,"Wow!",hs);
        else if (hi > 8) showFace(FACE_IDX_HAPPY,"Nice!",hs);
        else showFace(FACE_IDX_DEFAULT,"Caught!",hs);
        // Publish landed event with height
        char catchData[96];
        snprintf(catchData, sizeof(catchData),
          "{\\\"state\\\":\\\"landed\\\",\\\"heightIn\\\":%.1f,\\\"heightM\\\":%.3f,\\\"freefallMs\\\":%.0f}",
          hi, lastTossHeight, fs * 1000);
        publishEvent("toss", catchData);
        tossResultTime = now;
      }
      if (tossState == TOSS_FREEFALL && now - freefallStart > 3000) {
        tossState = TOSS_IDLE; showFace(FACE_IDX_SAD,"Lost me?"); tossResultTime = now;
        publishEvent("toss", "{\\\"state\\\":\\\"lost\\\"}");
      }
      break;
    case TOSS_CAUGHT:
      if (now - tossResultTime > 3000) {
        tossState = TOSS_IDLE;
        showFace(FACE_IDX_HAPPY,"Toss me","up!");
      }
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
  if (now - lastMotionTime > MOTION_SLEEP_MS) return true;
  if (now - lastButtonPress > BUTTON_SLEEP_MS) return true;
  return false;
}

static void enterSleep() {
  state = STATE_SLEEPING;
  webSocket.disconnect();
  WiFi.disconnect(true);
  showFace(FACE_IDX_TIRED,"*yawn*"); delay(800);
  showFace(FACE_IDX_TIRED,"Zzz..."); delay(600);
  StickCP2.Display.setTextColor(COLOR_FACE, COLOR_BG);
  StickCP2.Display.setTextDatum(TL_DATUM);
  StickCP2.Display.drawString("z",100,30,2); delay(250);
  StickCP2.Display.drawString("z",108,18,2); delay(250);
  StickCP2.Display.drawString("Z",112,5,2); delay(400);
  Serial.println("Deep sleep..."); Serial.flush();
  // Wake on BtnA (GPIO 37) in addition to power button (GPIO 35 via M5Unified)
  esp_sleep_enable_ext1_wakeup(1ULL << GPIO_NUM_37, ESP_EXT1_WAKEUP_ALL_LOW);
  StickCP2.Power.deepSleep(0, true);
}

// ── Wake Animation ───────────────────────────────────────────────────

static void playWakeAnimation() {
  StickCP2.Display.setBrightness(80);
  StickCP2.Display.fillScreen(COLOR_BG);
  showFace(FACE_IDX_TIRED,""); delay(400);
  showFace(FACE_IDX_TIRED,"*yawn*"); delay(600);
  showFace(FACE_IDX_HAPPY,"Hi there!"); delay(800);
}

// ── Show Ready ───────────────────────────────────────────────────────

static void showReady() {
  StickCP2.Display.fillScreen(COLOR_BG);
  drawModeIndicator();
  switch (mode) {
    case MODE_WAND: showFace(FACE_IDX_HAPPY,"Wave the","wand!"); break;
    case MODE_TOSS: showFace(FACE_IDX_HAPPY,"Toss me","up!"); break;
    case MODE_DEBUG: drawDebugScreen(); break;
  }
}

// ── Setup ────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(100);

  auto cfg = M5.config();
  cfg.serial_baudrate = 0;
  StickCP2.begin(cfg);
  StickCP2.Display.setRotation(0);
  StickCP2.Display.setBrightness(80);

  // IMU
  auto* imuBase = StickCP2.Imu.getImuInstancePtr(0);
  if (!imuBase) {
    StickCP2.Display.fillScreen(TFT_RED);
    StickCP2.Display.setTextColor(WHITE);
    StickCP2.Display.drawString("IMU FAIL", 67, 120, 4);
    while (true) delay(1000);
  }
  mpu = static_cast<m5::MPU6886_Class*>(imuBase);

  // WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("Connecting to %s...\n", WIFI_SSID);

  // Ably WebSocket
  char wsPath[256];
  snprintf(wsPath, sizeof(wsPath), "/?key=%s&format=json&v=1.2&clientId=stickman", ABLY_KEY);
  webSocket.beginSSL("realtime.ably.io", 443, wsPath);
  webSocket.onEvent(ablyEvent);
  webSocket.setReconnectInterval(3000);
  // No WebSocket-level ping — Ably has its own heartbeat (action 0).
  // The old enableHeartbeat(15000, 3000, 2) was too aggressive and caused
  // periodic disconnects when the server was slow to respond to WS PINGs.

  // Timers
  unsigned long now = millis();
  lastButtonPress = now; lastMotionTime = now; lastBlink = now;
  lastMotionCheck = now; lastGestureTime = now;

  playWakeAnimation();
  state = STATE_READY;
  showReady();
  Serial.println("Sloth ready.");
}

// ── Main Loop ────────────────────────────────────────────────────────

void loop() {
  StickCP2.update();
  webSocket.loop();
  unsigned long now = millis();

  // Buttons — track press and release for both
  if (M5.BtnA.wasPressed()) {
    lastButtonPress = now;
    publishEvent("btn", "{\\\"button\\\":\\\"A\\\",\\\"state\\\":\\\"down\\\"}");
  }
  if (M5.BtnA.wasReleased()) {
    publishEvent("btn", "{\\\"button\\\":\\\"A\\\",\\\"state\\\":\\\"up\\\"}");
  }
  if (M5.BtnB.wasPressed()) {
    lastButtonPress = now;
    publishEvent("btn", "{\\\"button\\\":\\\"B\\\",\\\"state\\\":\\\"down\\\"}");
    // Switch mode
    mode = (mode == MODE_WAND) ? MODE_TOSS : (mode == MODE_TOSS) ? MODE_DEBUG : MODE_WAND;
    const char* modeNames[] = {"wand", "toss", "debug"};
    char modeData[64];
    snprintf(modeData, sizeof(modeData), "{\\\"mode\\\":\\\"%s\\\"}", modeNames[mode]);
    publishEvent("mode", modeData);
    gyroZAccum = 0; thrustAccum = 0; thrustSamples = 0;
    prevAccMag = 0; lastGyroTime = 0; isBlinking = false;
    tossState = TOSS_IDLE;
    state = STATE_READY;
    showReady();
    return;
  }
  if (M5.BtnB.wasReleased()) {
    publishEvent("btn", "{\\\"button\\\":\\\"B\\\",\\\"state\\\":\\\"up\\\"}");
  }

  // Read IMU
  readIMUFull();
  float accMag = sqrtf(imuAx*imuAx + imuAy*imuAy + imuAz*imuAz);

  // Publish to Ably
  publishIMU();

  // Motion tracking
  motionAccum += fabsf(accMag - 1.0f) + fabsf(imuGz) * 0.01f;
  motionSamples++;

  // State machine
  switch (state) {
    case STATE_READY: {
      if (mode != MODE_DEBUG && checkShouldSleep(now)) { enterSleep(); return; }

      // Debug screen refresh
      if (mode == MODE_DEBUG) {
        if (now - lastDebugDraw > 500) {
          drawDebugScreen();
          lastDebugDraw = now;
        }
        break;
      }

      // Occasional random face (rare, skip during active toss)
      if (!(mode == MODE_TOSS && tossState != TOSS_IDLE)) {
        if (now - lastBlink > blinkInterval && !isBlinking) {
          // 1 in 4 chance of a silly/tired flash, otherwise just stay happy
          if (random(4) == 0) {
            drawFace(random(2) ? FACE_IDX_SILLY : FACE_IDX_DEFAULT);
            isBlinking = true;
          }
          lastBlink = now;
          blinkInterval = random(8000, 20000); // 8-20 seconds between checks
        }
        if (isBlinking && now - lastBlink >= 400) {
          drawFace(FACE_IDX_HAPPY);
          isBlinking = false;
        }
      }

      if (mode == MODE_WAND) {
        GestureType g = detectWandGesture();
        if (g != GESTURE_NONE) {
          lastGesture = g; state = STATE_RESULT; resultTime = now;
          // Publish gesture event
          char gestData[64];
          snprintf(gestData, sizeof(gestData), "{\\\"gesture\\\":\\\"%s\\\"}", GESTURE_NAMES[g]);
          publishEvent("gesture", gestData);
          switch (g) {
            case GESTURE_CIRCLE_LEFT:  showFace(FACE_IDX_DIZZY,"Circle","Left!"); break;
            case GESTURE_CIRCLE_RIGHT: showFace(FACE_IDX_DIZZY,"Circle","Right!"); break;
            case GESTURE_TAP:          showFace(FACE_IDX_SHOCKED,"Tap!"); break;
            case GESTURE_THRUST:       showFace(FACE_IDX_SILLY,"Thrust!"); break;
            default: break;
          }
        }
      } else if (mode == MODE_TOSS) {
        updateTossDetection(accMag, now);
      }
      break;
    }
    case STATE_RESULT:
      if (now - resultTime > 2000) { state = STATE_READY; showReady(); lastBlink = now; }
      break;
    default: break;
  }

  delay(10); // ~100Hz loop for fast IMU streaming
}
