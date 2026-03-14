#include <M5StickCPlus2.h>
#include <utility/imu/MPU6886_Class.hpp>
#include <kb.h>

#define CHANNELS_PER_SAMPLE 7

enum AppState {
  STATE_READY,
  STATE_COLLECTING,
  STATE_RESULT
};

// Class map from model.json: result index -> letter
static const char* CLASS_NAMES[] = {"?", "E", "I", "L", "M", "N", "S", "?"};
static const uint32_t CLASS_COLORS[] = {
  0x808080,  // 0: Unknown - gray
  0xFF0000,  // 1: E - red
  0x00FF00,  // 2: I - green
  0x0040FF,  // 3: L - blue
  0xFFFF00,  // 4: M - yellow
  0x00FFFF,  // 5: N - cyan
  0xFF00FF,  // 6: S - magenta
  0x808080   // 7: Unknown - gray
};

static AppState state = STATE_READY;
static int lastResult = -1;
static unsigned long resultTime = 0;
static bool classificationDone = false;
static m5::IMU_Base* imuBase = nullptr;
static bool btnWasPressed = false;

static void drainFifo() {
  m5::IMU_Base::imu_raw_data_t raw;
  while (imuBase->getImuRawData(&raw) != m5::IMU_Base::imu_spec_none) {}
}

static void showReady() {
  StickCP2.Display.fillScreen(BLACK);
  StickCP2.Display.setTextColor(WHITE);
  StickCP2.Display.setTextSize(3);
  StickCP2.Display.setCursor(30, 20);
  StickCP2.Display.println("READY");
  StickCP2.Display.setTextSize(1);
  StickCP2.Display.setCursor(20, 70);
  StickCP2.Display.setTextColor(0xAD55); // light gray
  StickCP2.Display.println("Hold A + draw in air");
  StickCP2.Display.setCursor(20, 90);
  StickCP2.Display.println("Release to detect");
}

static void showCollecting() {
  StickCP2.Display.fillScreen(0x0010); // dark blue
  StickCP2.Display.setTextColor(WHITE);
  StickCP2.Display.setTextSize(2);
  StickCP2.Display.setCursor(30, 30);
  StickCP2.Display.println("Drawing...");
  StickCP2.Display.setTextSize(1);
  StickCP2.Display.setCursor(30, 80);
  StickCP2.Display.println("Release when done");
}

static void showResult(int classIndex) {
  uint32_t color = CLASS_COLORS[classIndex & 7];
  uint16_t r = (color >> 16) & 0xFF;
  uint16_t g = (color >> 8) & 0xFF;
  uint16_t b = color & 0xFF;
  uint16_t bg565 = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);

  StickCP2.Display.fillScreen(bg565);
  StickCP2.Display.setTextColor(WHITE);
  StickCP2.Display.setTextSize(7);

  const char* label = CLASS_NAMES[classIndex & 7];
  int16_t tw = strlen(label) * 42;
  int16_t x = (240 - tw) / 2;
  int16_t y = (135 - 49) / 2;
  StickCP2.Display.setCursor(x, y);
  StickCP2.Display.println(label);

  if (classIndex == 0 || classIndex >= 7) {
    StickCP2.Display.setTextSize(1);
    StickCP2.Display.setCursor(70, 110);
    StickCP2.Display.println("Unknown gesture");
  }
}

void setup() {
  Serial.begin(115200);
  delay(100);

  auto cfg = M5.config();
  cfg.serial_baudrate = 0; // don't reinit serial
  StickCP2.begin(cfg);

  StickCP2.Display.setRotation(3);

  // Initialize SensiML knowledge pack
  kb_model_init();

  // Get MPU6886 and enable FIFO at 250Hz (matches the model's training data)
  imuBase = StickCP2.Imu.getImuInstancePtr(0);
  auto* mpu = static_cast<m5::MPU6886_Class*>(imuBase);
  mpu->enableFIFO(m5::MPU6886_Class::ODR_250Hz);

  // Drain any stale FIFO data
  drainFifo();

  showReady();
  Serial.println("Magic wand ready. Hold Button A and draw a gesture.");
}

void loop() {
  StickCP2.update();
  bool btnPressed = StickCP2.BtnA.isPressed();

  switch (state) {
    case STATE_READY:
      drainFifo();
      if (btnPressed && !btnWasPressed) {
        state = STATE_COLLECTING;
        classificationDone = false;
        showCollecting();
        Serial.println("Collecting gesture data...");
      }
      break;

    case STATE_COLLECTING: {
      m5::IMU_Base::imu_raw_data_t raw;
      while (imuBase->getImuRawData(&raw) != m5::IMU_Base::imu_spec_none) {
        int16_t pSample[CHANNELS_PER_SAMPLE];
        pSample[0] = raw.accel.x;
        pSample[1] = raw.accel.y;
        pSample[2] = raw.accel.z;
        pSample[3] = raw.gyro.x;
        pSample[4] = raw.gyro.y;
        pSample[5] = raw.gyro.z;

        if (btnPressed) {
          pSample[6] = 4096; // trigger HIGH
          kb_data_streaming((SENSOR_DATA_T*)pSample, CHANNELS_PER_SAMPLE, 0);
        } else if (!classificationDone) {
          pSample[6] = 0; // trigger LOW
          int result = kb_run_model((SENSOR_DATA_T*)pSample, CHANNELS_PER_SAMPLE, 0);
          classificationDone = true;
          kb_flush_model_buffer(0);
          kb_reset_model(0);

          lastResult = (result >= 0) ? result : 0;
          state = STATE_RESULT;
          resultTime = millis();
          showResult(lastResult);
          Serial.printf("Classification: %s (%d)\n", CLASS_NAMES[lastResult & 7], lastResult);
          break;
        }
      }

      // Handle case where button released between FIFO reads
      if (!btnPressed && !classificationDone) {
        int16_t pSample[CHANNELS_PER_SAMPLE] = {0, 0, 0, 0, 0, 0, 0};
        int result = kb_run_model((SENSOR_DATA_T*)pSample, CHANNELS_PER_SAMPLE, 0);
        classificationDone = true;
        kb_flush_model_buffer(0);
        kb_reset_model(0);

        lastResult = (result >= 0) ? result : 0;
        state = STATE_RESULT;
        resultTime = millis();
        showResult(lastResult);
        Serial.printf("Classification: %s (%d)\n", CLASS_NAMES[lastResult & 7], lastResult);
      }
      break;
    }

    case STATE_RESULT:
      drainFifo();
      if (millis() - resultTime > 2000) {
        state = STATE_READY;
        showReady();
      }
      break;
  }

  btnWasPressed = btnPressed;
  delay(1);
}
