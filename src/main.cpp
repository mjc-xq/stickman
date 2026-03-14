#include <M5StickCPlus2.h>
#include <utility/imu/MPU6886_Class.hpp>

// ── Sloth Color Palette (RGB565) ─────────────────────────────────────
#define COLOR_BG    0xF79E  // Light Cream
#define COLOR_FACE  0xBDB7  // Lighter warm brown
#define COLOR_PATCH 0x8C51  // Soft medium brown
#define COLOR_INNER 0x6328  // Darker brown for inner patches
#define COLOR_TEXT  0x4228  // Dark Coffee
#define COLOR_BLUSH 0xFCD3  // Softer Pink
#define COLOR_NOSE  0x39C7  // Dark nose

// ── App Modes ────────────────────────────────────────────────────────
enum AppMode {
  MODE_WAND,
  MODE_TOSS
};

// ── Gesture Types (Wand mode) ────────────────────────────────────────
enum GestureType {
  GESTURE_NONE = 0,
  GESTURE_CIRCLE_LEFT,
  GESTURE_CIRCLE_RIGHT,
  GESTURE_TAP,
  GESTURE_THRUST
};

static const char* GESTURE_NAMES[] = {
  "None", "Circle L", "Circle R", "Tap!", "Thrust!"
};

// ── Toss States ──────────────────────────────────────────────────────
enum TossState {
  TOSS_IDLE,
  TOSS_LAUNCHED,
  TOSS_FREEFALL,
  TOSS_CAUGHT
};

// ── App States ───────────────────────────────────────────────────────
enum AppState {
  STATE_READY,
  STATE_RESULT,
  STATE_SLEEPING
};

static AppMode mode = MODE_WAND;
static AppState state = STATE_READY;
static GestureType lastGesture = GESTURE_NONE;
static unsigned long resultTime = 0;

// ── Blink Animation ─────────────────────────────────────────────────
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

// ── Wand Gesture Detection State ─────────────────────────────────────
static float gyroZAccum = 0;
static float prevAccMag = 0;
static unsigned long lastTapTime = 0;
static float thrustAccum = 0;
static int thrustSamples = 0;
static unsigned long lastGestureTime = 0;
static const unsigned long GESTURE_COOLDOWN_MS = 800;
static unsigned long lastGyroTime = 0;

// ── Toss Detection State ────────────────────────────────────────────
static TossState tossState = TOSS_IDLE;
static unsigned long freefallStart = 0;
static unsigned long freefallEnd = 0;
static float lastTossHeight = 0;
static unsigned long tossResultTime = 0;
static int freefallSamples = 0;
static float launchAccPeak = 0;
static unsigned long launchTime = 0;

// ── Motion for power management ──────────────────────────────────────
static float motionAccum = 0;
static int motionSamples = 0;
static unsigned long lastMotionCheck = 0;

// ── IMU Helpers ──────────────────────────────────────────────────────

static void readAccelDirect(int16_t* ax, int16_t* ay, int16_t* az) {
  uint8_t buf[6];
  mpu->readRegister(m5::MPU6886_Class::REG_ACCEL_XOUT_H, buf, 6);
  *ax = (int16_t)((buf[0] << 8) | buf[1]);
  *ay = (int16_t)((buf[2] << 8) | buf[3]);
  *az = (int16_t)((buf[4] << 8) | buf[5]);
}

static void readGyroDirect(int16_t* gx, int16_t* gy, int16_t* gz) {
  uint8_t buf[6];
  mpu->readRegister(m5::MPU6886_Class::REG_GYRO_XOUT_H, buf, 6);
  *gx = (int16_t)((buf[0] << 8) | buf[1]);
  *gy = (int16_t)((buf[2] << 8) | buf[3]);
  *gz = (int16_t)((buf[4] << 8) | buf[5]);
}

static void readIMU(float* accX, float* accY, float* accZ, float* gyroZ) {
  int16_t ax, ay, az, gx, gy, gz;
  readAccelDirect(&ax, &ay, &az);
  readGyroDirect(&gx, &gy, &gz);
  *accX = ax * (8.0f / 32768.0f);
  *accY = ay * (8.0f / 32768.0f);
  *accZ = az * (8.0f / 32768.0f);
  *gyroZ = gz * (2000.0f / 32768.0f);
}

// ── Sloth Drawing ────────────────────────────────────────────────────

static void drawBaseFace() {
  StickCP2.Display.fillSmoothCircle(67, 85, 62, COLOR_FACE);
  // Ears
  StickCP2.Display.fillSmoothCircle(15, 40, 18, COLOR_FACE);
  StickCP2.Display.fillSmoothCircle(119, 40, 18, COLOR_FACE);
  StickCP2.Display.fillSmoothCircle(15, 40, 10, COLOR_INNER);
  StickCP2.Display.fillSmoothCircle(119, 40, 10, COLOR_INNER);
  // Eye patches
  StickCP2.Display.fillSmoothCircle(42, 85, 22, COLOR_INNER);
  StickCP2.Display.fillSmoothCircle(92, 85, 22, COLOR_INNER);
  StickCP2.Display.fillSmoothCircle(42, 85, 16, COLOR_PATCH);
  StickCP2.Display.fillSmoothCircle(92, 85, 16, COLOR_PATCH);
  // Nose
  StickCP2.Display.fillSmoothCircle(67, 105, 5, COLOR_NOSE);
  // Blush
  StickCP2.Display.fillSmoothCircle(25, 110, 8, COLOR_BLUSH);
  StickCP2.Display.fillSmoothCircle(109, 110, 8, COLOR_BLUSH);
}

static void clearEyes() {
  StickCP2.Display.fillSmoothCircle(42, 85, 14, COLOR_PATCH);
  StickCP2.Display.fillSmoothCircle(92, 85, 14, COLOR_PATCH);
}

static void clearMouth() {
  StickCP2.Display.fillRect(48, 115, 38, 22, COLOR_FACE);
}

static void clearTextArea() {
  StickCP2.Display.fillRect(0, 155, 135, 85, COLOR_BG);
}

static void drawEyes(const char* expression) {
  clearEyes();
  if (strcmp(expression, "blink") == 0 || strcmp(expression, "sleep") == 0) {
    StickCP2.Display.drawArc(42, 85, 7, 7, 0, 180, COLOR_TEXT);
    StickCP2.Display.drawArc(92, 85, 7, 7, 0, 180, COLOR_TEXT);
  } else if (strcmp(expression, "surprised") == 0) {
    StickCP2.Display.fillSmoothCircle(42, 85, 10, BLACK);
    StickCP2.Display.fillSmoothCircle(92, 85, 10, BLACK);
    StickCP2.Display.fillSmoothCircle(44, 82, 3, WHITE);
    StickCP2.Display.fillSmoothCircle(94, 82, 3, WHITE);
  } else if (strcmp(expression, "excited") == 0) {
    StickCP2.Display.fillSmoothCircle(42, 85, 9, BLACK);
    StickCP2.Display.fillSmoothCircle(92, 85, 9, BLACK);
    StickCP2.Display.fillSmoothCircle(44, 83, 3, WHITE);
    StickCP2.Display.fillSmoothCircle(94, 83, 3, WHITE);
    StickCP2.Display.fillSmoothCircle(39, 87, 2, WHITE);
    StickCP2.Display.fillSmoothCircle(89, 87, 2, WHITE);
  } else if (strcmp(expression, "dizzy") == 0) {
    StickCP2.Display.drawArc(42, 85, 8, 8, 0, 270, BLACK);
    StickCP2.Display.drawArc(42, 85, 5, 5, 90, 360, BLACK);
    StickCP2.Display.drawArc(92, 85, 8, 8, 0, 270, BLACK);
    StickCP2.Display.drawArc(92, 85, 5, 5, 90, 360, BLACK);
  } else if (strcmp(expression, "sleepy") == 0) {
    StickCP2.Display.fillSmoothCircle(42, 87, 6, BLACK);
    StickCP2.Display.fillRect(28, 75, 28, 12, COLOR_PATCH);
    StickCP2.Display.fillSmoothCircle(92, 87, 6, BLACK);
    StickCP2.Display.fillRect(78, 75, 28, 12, COLOR_PATCH);
  } else if (strcmp(expression, "determined") == 0) {
    StickCP2.Display.fillSmoothCircle(42, 86, 7, BLACK);
    StickCP2.Display.fillSmoothCircle(92, 86, 7, BLACK);
    StickCP2.Display.fillSmoothCircle(43, 84, 2, WHITE);
    StickCP2.Display.fillSmoothCircle(93, 84, 2, WHITE);
    StickCP2.Display.drawLine(33, 72, 48, 74, COLOR_TEXT);
    StickCP2.Display.drawLine(86, 74, 101, 72, COLOR_TEXT);
  } else if (strcmp(expression, "scared") == 0) {
    // Wide scared eyes
    StickCP2.Display.fillSmoothCircle(42, 85, 11, WHITE);
    StickCP2.Display.fillSmoothCircle(92, 85, 11, WHITE);
    StickCP2.Display.fillSmoothCircle(42, 86, 6, BLACK);
    StickCP2.Display.fillSmoothCircle(92, 86, 6, BLACK);
    StickCP2.Display.fillSmoothCircle(43, 85, 2, WHITE);
    StickCP2.Display.fillSmoothCircle(93, 85, 2, WHITE);
  } else if (strcmp(expression, "proud") == 0) {
    // Happy closed-eye smile
    StickCP2.Display.drawArc(42, 88, 7, 7, 180, 360, COLOR_TEXT);
    StickCP2.Display.drawArc(92, 88, 7, 7, 180, 360, COLOR_TEXT);
  } else {
    // Default happy
    StickCP2.Display.fillSmoothCircle(42, 85, 7, BLACK);
    StickCP2.Display.fillSmoothCircle(92, 85, 7, BLACK);
    StickCP2.Display.fillSmoothCircle(44, 83, 2, WHITE);
    StickCP2.Display.fillSmoothCircle(94, 83, 2, WHITE);
  }
}

static void drawMouth(const char* expression) {
  clearMouth();
  if (strcmp(expression, "surprised") == 0 || strcmp(expression, "scared") == 0) {
    StickCP2.Display.fillSmoothCircle(67, 122, 6, COLOR_TEXT);
    StickCP2.Display.fillSmoothCircle(67, 122, 3, COLOR_FACE);
  } else if (strcmp(expression, "sleep") == 0 || strcmp(expression, "determined") == 0) {
    StickCP2.Display.drawFastHLine(60, 122, 14, COLOR_TEXT);
    StickCP2.Display.drawFastHLine(60, 123, 14, COLOR_TEXT);
  } else if (strcmp(expression, "excited") == 0) {
    StickCP2.Display.fillSmoothCircle(67, 122, 7, COLOR_TEXT);
    StickCP2.Display.fillRect(58, 114, 18, 8, COLOR_FACE);
  } else if (strcmp(expression, "sleepy") == 0) {
    StickCP2.Display.fillSmoothCircle(67, 122, 5, COLOR_TEXT);
    StickCP2.Display.fillSmoothCircle(67, 122, 3, COLOR_FACE);
  } else if (strcmp(expression, "proud") == 0) {
    // Big happy grin
    StickCP2.Display.drawArc(67, 118, 10, 10, 10, 170, COLOR_TEXT);
    StickCP2.Display.drawArc(67, 118, 9, 9, 10, 170, COLOR_TEXT);
  } else {
    // Default smile
    StickCP2.Display.drawArc(67, 118, 8, 8, 10, 170, COLOR_TEXT);
  }
}

static void showMessage(const char* line1, const char* line2 = nullptr) {
  clearTextArea();
  StickCP2.Display.setTextColor(COLOR_TEXT, COLOR_BG);
  StickCP2.Display.setTextDatum(BC_DATUM);
  if (line2) {
    StickCP2.Display.drawString(line1, 67, 200, 4);
    StickCP2.Display.drawString(line2, 67, 232, 4);
  } else {
    StickCP2.Display.drawString(line1, 67, 220, 4);
  }
}

static void updateExpression(const char* expression, const char* msg1, const char* msg2 = nullptr) {
  drawEyes(expression);
  drawMouth(expression);
  showMessage(msg1, msg2);
}

// ── Mode indicator (small text at top) ───────────────────────────────

static void drawModeIndicator() {
  StickCP2.Display.fillRect(0, 0, 135, 16, COLOR_BG);
  StickCP2.Display.setTextColor(COLOR_INNER, COLOR_BG);
  StickCP2.Display.setTextDatum(TC_DATUM);
  const char* modeStr = (mode == MODE_WAND) ? "[Wand]" : "[Toss]";
  StickCP2.Display.drawString(modeStr, 67, 2, 2);
}

// ── Wand Gesture Detection ───────────────────────────────────────────

static GestureType detectWandGesture(float accX, float accY, float accZ, float gyroZ) {
  unsigned long now = millis();
  if (now - lastGestureTime < GESTURE_COOLDOWN_MS) return GESTURE_NONE;

  float accMag = sqrtf(accX * accX + accY * accY + accZ * accZ);

  // TAP: sharp spike in accel magnitude
  float accDelta = fabsf(accMag - prevAccMag);
  prevAccMag = accMag;

  if (accDelta > 1.5f && now - lastTapTime > 400) {
    lastTapTime = now;
    lastGestureTime = now;
    return GESTURE_TAP;
  }

  // THRUST: sustained strong accel on Y axis (device long axis)
  if (fabsf(accY) > 2.0f) {
    thrustAccum += accY;
    thrustSamples++;
    if (thrustSamples > 5 && fabsf(thrustAccum / thrustSamples) > 1.8f) {
      thrustAccum = 0;
      thrustSamples = 0;
      lastGestureTime = now;
      return GESTURE_THRUST;
    }
  } else {
    thrustAccum = 0;
    thrustSamples = 0;
  }

  // CIRCLE: accumulate gyro Z rotation
  float dt = (lastGyroTime > 0) ? (now - lastGyroTime) / 1000.0f : 0.02f;
  lastGyroTime = now;

  if (fabsf(gyroZ) > 30.0f) {
    gyroZAccum += gyroZ * dt;
  } else {
    if (fabsf(gyroZAccum) > 200.0f) {
      GestureType g = (gyroZAccum > 0) ? GESTURE_CIRCLE_RIGHT : GESTURE_CIRCLE_LEFT;
      gyroZAccum = 0;
      lastGestureTime = now;
      return g;
    }
    gyroZAccum *= 0.95f;
    if (fabsf(gyroZAccum) < 10.0f) gyroZAccum = 0;
  }

  return GESTURE_NONE;
}

// ── Toss Detection ───────────────────────────────────────────────────

static void updateTossDetection(float accMag, unsigned long now) {
  switch (tossState) {
    case TOSS_IDLE:
      // Detect launch: very high acceleration (throw upward)
      if (accMag > 3.0f) {
        launchAccPeak = accMag;
        launchTime = now;
        tossState = TOSS_LAUNCHED;
        Serial.println("Toss: launch detected");
      }
      break;

    case TOSS_LAUNCHED:
      // Track peak launch force
      if (accMag > launchAccPeak) launchAccPeak = accMag;
      // Transition to freefall when accel drops near zero
      if (accMag < 0.3f) {
        tossState = TOSS_FREEFALL;
        freefallStart = now;
        freefallSamples = 0;
        Serial.println("Toss: freefall!");
        updateExpression("scared", "AAAH!");
      } else if (now - launchTime > 500) {
        // Timeout: no freefall within 500ms, reset
        tossState = TOSS_IDLE;
      } else if (accMag < 2.0f && accMag > 0.5f) {
        // Settled back to normal without freefall
        tossState = TOSS_IDLE;
      }
      break;

    case TOSS_FREEFALL:
      freefallSamples++;
      // Still in freefall if near-zero gravity
      if (accMag < 0.5f) {
        // Still falling
      } else if (accMag > 1.5f && freefallSamples > 3) {
        // Caught! High accel = impact of catch
        freefallEnd = now;
        tossState = TOSS_CAUGHT;

        // Height from freefall: h = 0.5 * g * (t/2)^2
        // t = total freefall (up + down), t/2 = time to apex
        float freefallSec = (freefallEnd - freefallStart) / 1000.0f;
        float halfTime = freefallSec / 2.0f;
        lastTossHeight = 0.5f * 9.81f * halfTime * halfTime; // meters

        // Convert to cm for display
        float heightCm = lastTossHeight * 100.0f;

        char heightStr[16];
        if (heightCm >= 100) {
          snprintf(heightStr, sizeof(heightStr), "%.1fm!", lastTossHeight);
        } else {
          snprintf(heightStr, sizeof(heightStr), "%.0fcm!", heightCm);
        }

        // Pick expression based on height
        if (heightCm > 100) {
          updateExpression("scared", "SO HIGH!", heightStr);
        } else if (heightCm > 50) {
          updateExpression("excited", "Wow!", heightStr);
        } else if (heightCm > 20) {
          updateExpression("proud", "Nice!", heightStr);
        } else {
          updateExpression("happy", "Whee!", heightStr);
        }

        tossResultTime = now;
        Serial.printf("Toss caught! Height: %.1f cm (freefall: %.0f ms)\n",
                      heightCm, freefallSec * 1000);
      }
      // Timeout: if freefall lasts > 3 seconds, something is wrong
      if (now - freefallStart > 3000) {
        tossState = TOSS_IDLE;
        updateExpression("dizzy", "Lost me?");
        tossResultTime = now;
      }
      break;

    case TOSS_CAUGHT:
      // Show result for 3 seconds
      if (now - tossResultTime > 3000) {
        tossState = TOSS_IDLE;
        showMessage("Toss me!");
        drawEyes("happy");
        drawMouth("happy");
      }
      break;
  }
}

// ── Power Management ─────────────────────────────────────────────────

static bool checkShouldSleep(unsigned long now) {
  if (now - lastMotionCheck > 1000) {
    float avgMotion = (motionSamples > 0) ? motionAccum / motionSamples : 0;
    if (avgMotion > 0.15f) {
      lastMotionTime = now;
    }
    motionAccum = 0;
    motionSamples = 0;
    lastMotionCheck = now;
  }
  if (now - lastMotionTime > MOTION_SLEEP_MS) return true;
  if (now - lastButtonPress > BUTTON_SLEEP_MS) return true;
  return false;
}

static void enterSleep() {
  state = STATE_SLEEPING;
  updateExpression("sleepy", "*yawn*");
  delay(800);
  updateExpression("sleep", "Zzz...");
  delay(600);

  StickCP2.Display.setTextColor(COLOR_TEXT, COLOR_BG);
  StickCP2.Display.setTextDatum(TL_DATUM);
  StickCP2.Display.drawString("z", 100, 30, 2);
  delay(250);
  StickCP2.Display.drawString("z", 108, 18, 2);
  delay(250);
  StickCP2.Display.drawString("Z", 112, 5, 2);
  delay(400);

  Serial.println("Entering deep sleep...");
  Serial.flush();
  StickCP2.Power.deepSleep(0, true);
}

// ── Wake Animation ───────────────────────────────────────────────────

static void playWakeAnimation() {
  StickCP2.Display.setBrightness(80);
  StickCP2.Display.fillScreen(COLOR_BG);

  drawBaseFace();
  drawEyes("sleep");
  drawMouth("sleep");
  delay(400);

  drawEyes("sleepy");
  drawMouth("sleepy");
  showMessage("*yawn*");
  delay(600);

  drawEyes("happy");
  drawMouth("happy");
  showMessage("Hi there!");
  delay(800);
}

// ── Screen Setup ─────────────────────────────────────────────────────

static void showReady() {
  StickCP2.Display.fillScreen(COLOR_BG);
  drawBaseFace();
  drawModeIndicator();
  const char* msg = (mode == MODE_WAND) ? "Wave wand!" : "Toss me!";
  updateExpression("happy", msg);
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

  // Get MPU6886
  auto* imuBase = StickCP2.Imu.getImuInstancePtr(0);
  if (!imuBase) {
    StickCP2.Display.fillScreen(TFT_RED);
    StickCP2.Display.setTextColor(WHITE);
    StickCP2.Display.drawString("IMU FAIL", 67, 120, 4);
    while (true) { delay(1000); }
  }
  mpu = static_cast<m5::MPU6886_Class*>(imuBase);

  // Initialize timers
  unsigned long now = millis();
  lastButtonPress = now;
  lastMotionTime = now;
  lastBlink = now;
  lastMotionCheck = now;
  lastGestureTime = now;

  playWakeAnimation();
  state = STATE_READY;
  showReady();
  Serial.println("Sloth ready.");
}

// ── Main Loop ────────────────────────────────────────────────────────

void loop() {
  StickCP2.update();
  unsigned long now = millis();

  // ── Button handling ──
  if (M5.BtnA.wasPressed()) {
    lastButtonPress = now;
  }
  if (M5.BtnB.wasPressed()) {
    lastButtonPress = now;
    // Switch mode
    mode = (mode == MODE_WAND) ? MODE_TOSS : MODE_WAND;
    // Reset all detection state
    gyroZAccum = 0;
    thrustAccum = 0;
    thrustSamples = 0;
    prevAccMag = 0;
    lastGyroTime = 0;
    isBlinking = false;
    tossState = TOSS_IDLE;
    state = STATE_READY;
    showReady();
    Serial.printf("Mode: %s\n", (mode == MODE_WAND) ? "Wand" : "Toss");
    return;
  }

  // ── Read IMU ──
  float accX, accY, accZ, gyroZ;
  readIMU(&accX, &accY, &accZ, &gyroZ);
  float accMag = sqrtf(accX * accX + accY * accY + accZ * accZ);

  // ── Motion tracking for power management ──
  motionAccum += fabsf(accMag - 1.0f) + fabsf(gyroZ) * 0.01f;
  motionSamples++;

  // ── State machine ──
  switch (state) {
    case STATE_READY: {
      // Power management
      if (checkShouldSleep(now)) {
        enterSleep();
        return;
      }

      // Non-blocking blink (skip during active toss)
      if (!(mode == MODE_TOSS && tossState != TOSS_IDLE)) {
        if (now - lastBlink > blinkInterval && !isBlinking) {
          drawEyes("blink");
          isBlinking = true;
          lastBlink = now;
          blinkInterval = random(3000, 8000);
        }
        if (isBlinking && now - lastBlink >= 150) {
          drawEyes("happy");
          isBlinking = false;
        }
      }

      if (mode == MODE_WAND) {
        GestureType g = detectWandGesture(accX, accY, accZ, gyroZ);
        if (g != GESTURE_NONE) {
          lastGesture = g;
          state = STATE_RESULT;
          resultTime = now;
          // Show gesture-specific expression
          switch (g) {
            case GESTURE_CIRCLE_LEFT:  updateExpression("dizzy", "Whee L!"); break;
            case GESTURE_CIRCLE_RIGHT: updateExpression("dizzy", "Whee R!"); break;
            case GESTURE_TAP:          updateExpression("surprised", "Boop!"); break;
            case GESTURE_THRUST:       updateExpression("determined", "Whoosh!"); break;
            default: break;
          }
          Serial.printf("Wand: %s\n", GESTURE_NAMES[g]);
        }
      } else {
        // Toss mode
        updateTossDetection(accMag, now);
      }
      break;
    }

    case STATE_RESULT:
      if (now - resultTime > 2000) {
        state = STATE_READY;
        showReady();
        lastBlink = now;
      }
      break;

    default:
      break;
  }

  delay(20);
}
