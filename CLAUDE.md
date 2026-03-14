# Stickman - Magic Wand

ESP32 magic wand gesture recognition app for M5StickC Plus 2. Draw letters in the air while holding Button A — the device recognizes the gesture and displays it on screen.

## Hardware

- **Board**: M5StickC Plus 2 (ESP32-PICO-V3-02, 240MHz, 320KB RAM, 4MB Flash)
- **USB-Serial**: CH9102 at `/dev/cu.usbserial-5B1E0467791`
- **Display**: 1.14" TFT LCD (135x240)
- **IMU**: MPU6886 (6-axis, accel + gyro) with FIFO at 250Hz
- **Power**: AXP2101

## Build & Upload

```bash
pio run                  # Build
pio run --target upload  # Build + upload to board
pio device monitor       # Serial monitor (115200 baud)
```

## How It Works

1. Boot → "READY" screen
2. Hold **Button A** + draw a letter in the air → "Drawing..." screen
3. Release Button A → SensiML ML model classifies the gesture
4. Detected letter shown on screen for 2 seconds, then back to ready

## Recognized Gestures

| Class | Letter | Color |
|-------|--------|-------|
| 1 | E | Red |
| 2 | I | Green |
| 3 | L | Blue |
| 4 | M | Yellow |
| 5 | N | Cyan |
| 6 | S | Magenta |
| 0,7 | Unknown | Gray |

## Project Structure

- `src/main.cpp` — Main app: state machine, IMU FIFO reading, KB integration, display
- `lib/sensiml/` — SensiML Knowledge Pack (Decision Tree Ensemble classifier)
  - `src/kb.h` — KB API: `kb_model_init()`, `kb_data_streaming()`, `kb_run_model()`, etc.
  - `src/kb_typedefs.h` — `SENSOR_DATA_T` = `signed short`, sensor column ordering
  - `src/esp32/libsensiml.a` — Precompiled ML model (~4.9MB)
- `platformio.ini` — Board config, lib deps, linker flags for sensiml

## Key Technical Details

- **IMU data pipeline**: MPU6886 FIFO enabled at 250Hz via `m5::MPU6886_Class::enableFIFO()`. Raw int16 accel+gyro data read in a loop via `getImuRawData()`.
- **Trigger channel**: 7th sensor column. Set to 4096 while Button A held, 0 on release. The model uses this for segmentation.
- **Classification flow**: While button held → `kb_data_streaming()` fills ring buffer. On release → `kb_run_model()` runs one-shot classification, then `kb_flush_model_buffer()` + `kb_reset_model()`.
- **Model**: Decision Tree Ensemble trained on downsampled max-normalized features from 6 IMU axes.

## Libraries

- **M5StickCPlus2** (via M5Unified + M5GFX) — Board support, display, buttons, IMU
- **SensiML Knowledge Pack** — Gesture classification ML model
- `DFRobot_GP8XXX` in `lib_ignore` (compile error with this framework version)

## M5Unified API

```cpp
auto cfg = M5.config();
StickCP2.begin(cfg);
StickCP2.Display              // LCD (LGFX-based)
StickCP2.BtnA / StickCP2.BtnB // Buttons
StickCP2.Imu                  // IMU sensor
StickCP2.Imu.getImuInstancePtr(0) // Raw MPU6886 access
```
